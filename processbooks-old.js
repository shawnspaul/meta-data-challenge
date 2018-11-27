const fs = require('fs');
const path = require('path');
const parseString = require('xml2js').parseString;
const unzip = require('unzip');
const tar = require('tar-stream');
const extract = tar.extract();
const db = require('./models');

const zipFolder = __dirname + '\\processing\\zip';
const tarFolder = __dirname + '\\processing\\tar';
const pendingFolder = __dirname + '\\processing\\pending';
const archiveFoler = __dirname + '\\processing\\archive'

db.connection.sync().then(async function() {
    fs.readdir(zipFolder, async function(err, files) {
        if (err) {
            console.log(err);
            process.exit(1);
        }
        await files.map(file => {
            fs.createReadStream(`${zipFolder}\\${file}`).pipe(unzip.Extract({
                path: tarFolder
            }));
            return file;
        });
        fs.readdir(tarFolder, async function(err, files) {
            for (let file of files) {
                fs.createReadStream(`${tarFolder}\\${file}`).pipe(extract);
            }
            fs.readdir(pendingFolder, async function(err, files) {
                for (let file of files) {
                    fs.readFile(`${pendingFolder}/${file}`, {
                        encoding: 'utf-8'
                    }, async function(err, data) {
                        if (!err) {
                            let id = '';
                            let title = '';
                            let authors = [];
                            let publisher = '';
                            let publication_date = '';
                            let language = '';
                            let subjects = [];
                            let license = '';

                            let res = await xml2json(data);
                            res = JSON.stringify(res);
                            res = res.replace(/dcterms:/g, '');
                            res = res.replace(/pgterms:/g, '');
                            res = res.replace(/rdf:/g, '');
                            res = res.replace(/dcam:/g, '');
                            // console.log(res);
                            res = JSON.parse(res);
                            if (res.RDF !== undefined && res.RDF.ebook) {
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
                                db.Books.findOne({
                                    where: {
                                        book_id: id
                                    }
                                }).then(row => {
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
            });
        });
    });
});

extract.on('entry', function(header, stream, next) {
    let split = header.name.split('/');
    let file = header.name.split('/')[split.length - 1];

    stream.pipe(fs.createWriteStream(`${pendingFolder}/${file}`))
        .on('end', (resolve) => {
            console.log(`Data streamed to file ${file}`);
        })

    stream.on('end', function() {
        next();
    })

    stream.resume();
})

extract.on('finish', function() {
    console.log('done');
});

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