const fs = require('fs');
var gracefulFs = require('graceful-fs')
gracefulFs.gracefulify(fs);
const path = require('path');
const parseString = require('xml2js').parseString;
const unzip = require('unzip');
const tar = require('tar-stream');
const extract = tar.extract();
const db = require('./models');


// initialize staging folders
const zipFolder = __dirname + '\\processing\\zip';
const tarFolder = __dirname + '\\processing\\tar';
const pendingFolder = __dirname + '\\processing\\pending';
const archiveFoler = __dirname + '\\processing\\archive'


// connect to database and run the process
db.connection.sync().then(async function() {
    run();
});

async function run() {
    await processZip();
    await processTar();
    await processPending();
}

//extracts the tar files
extract.on('entry', async function(header, stream, next) {
    let split = header.name.split('/');
    let file = header.name.split('/')[split.length - 1];
    stream.pipe(fs.createWriteStream(`${pendingFolder}/${file}`))
        .on('end', (resolve) => {
            console.log(`Data streamed to file ${file}`);
        })

    stream.on('error', function() {
        console.log('there was an error');
    })

    stream.on('end', function() {
        next();
    })

    stream.resume();
})

extract.on('finish', function() {
    console.log('done');
});


// loops through the zip files and passes them to the unZip function
function processZip() {
    return new Promise((resolve, reject) => {
        fs.readdir(zipFolder, async function(err, files) {
            if (err) {
                console.log(err);
            }
            for (let file of files) {
                let ext = file.split('.').pop();
                if (ext.toLowerCase() == 'zip') {
                    await unZip(`${zipFolder}\\${file}`);
                }
                // await fs.createReadStream(`${zipFolder}\\${file}`).pipe(unzip.Extract({ path: tarFolder }));
                //.on('end', async function() { console.log(1); resolve();});
            }
            console.log('Step 1');
            resolve();
        });
    });
}

// unzips the zip files
function unZip(file) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(file).pipe(unzip.Extract({
            path: tarFolder
        })).on('close', function() {
            resolve();
        });
    })
}

// loops through the tar files in the tar folder and passes them to the untar function
function processTar() {
    return new Promise((resolve, reject) => {
        fs.readdir(tarFolder, async function(err, files) {
            if (err) {
                console.log(err);
            }
            for (let file of files) {
                let ext = file.split('.').pop();
                if (ext.toLowerCase() == 'tar') {
                    await unTar(`${tarFolder}\\${file}`);
                }
                // fs.createReadStream(`${tarFolder}\\${file}`).pipe(extract);
            }
            console.log('Step 2');
            resolve();
        });
    });
}

// extracts the tar files
function unTar(file) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(file).pipe(extract).on('finish', function() {
            console.log(1);
            resolve();
        });
    });
}

// reads and parses eache rdf file in the pending folder
function processPending() {
    console.log('Step 3');
    // gets the rdf files in the directory
    fs.readdir(pendingFolder, async function(err, files) {
        // loops through the files in the directory
        for (let file of files) {
            let ext = file.split('.').pop();
            if (ext.toLowerCase() == 'rdf') {
                fs.readFile(`${pendingFolder}/${file}`, {
                    encoding: 'utf-8'
                }, async function(err, data) {
                    if (!err) {
                        // initialize columns
                        let id = '';
                        let title = '';
                        let authors = [];
                        let publisher = '';
                        let publication_date = '';
                        let language = '';
                        let subjects = [];
                        let license = '';

                        // convert the data from the document to json
                        let res = await xml2json(data);
                        res = JSON.stringify(res);

                        // remove the precursors from the object names
                        res = res.replace(/dcterms:/g, '');
                        res = res.replace(/pgterms:/g, '');
                        res = res.replace(/rdf:/g, '');
                        res = res.replace(/dcam:/g, '');
                        res = JSON.parse(res);

                        // check and make sure that the main object exists
                        if (res.RDF !== undefined && res.RDF.ebook) {
                            // get all required fields if they exist
                            let ebook = res.RDF.ebook[0];
                            if (ebook.$ !== undefined && ebook.$.about !== undefined) {
                                id = ebook.$.about.replace('ebooks/', '');
                            }
                            if (ebook.subject !== undefined && Array.isArray(res.RDF.ebook[0].subject)) {
                                for (let subject of ebook.subject) {
                                    subjects.push(subject.Description[0].value[0]);
                                }
                            }
                            if (ebook.publisher !== undefined) {
                                publisher = ebook.publisher[0];
                            }
                            if (ebook.language !== undefined && Array.isArray(ebook.language)) {
                                if (ebook.language[0].Description !== undefined && Array.isArray(ebook.language[0].Description)) {
                                    if (ebook.language[0].Description[0].value !== undefined && Array.isArray(ebook.language[0].Description[0].value)) {
                                        language = ebook.language[0].Description[0].value[0]._;
                                    }
                                }
                            }
                            if (ebook.title !== undefined) {
                                title = ebook.title[0];
                            }
                            if (ebook.rights !== undefined) {
                                license = ebook.rights[0];
                            }
                            if (ebook.issued !== undefined) {
                                publication_date = ebook.issued[0]._;
                            }
                            if (ebook.creator !== undefined) {
                                for (let author of ebook.creator) {
                                    authors.push(author.agent[0].name[0]);
                                }
                            }

                            // after getting all the book information check to see if the book exists in the database
                            db.Books.findOne({
                                where: {
                                    book_id: id
                                }
                            }).then(row => {
                                // if it does exist, update the book
                                if (row) {
                                    db.Books.update({
                                        title: title,
                                        authors: authors,
                                        publisher: publisher,
                                        publication_date: publication_date,
                                        language: language,
                                        subjects: subjects,
                                        license_rights: license
                                    }, {
                                        where: {
                                            book_id: id
                                        }
                                    });
                                // if not, insert the book as a new record
                                } else {
                                    db.Books.create({
                                        book_id: id,
                                        title: title,
                                        authors: authors,
                                        publisher: publisher,
                                        publication_date: publication_date,
                                        language: language,
                                        subjects: subjects,
                                        license_rights: license
                                    });
                                }
                            });

                        }
                    } else {
                        console.log(err);
                    }
                });
            }
        }
    });
}

// converts the xml to a json object
async function xml2json(xml) {
    return new Promise((resolve, reject) => {
        parseString(xml, function(err, json) {
            if (err) {
                reject(err);
            } else {
                resolve(json);
            }
        });
    });
}
