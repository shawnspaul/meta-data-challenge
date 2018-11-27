module.exports = function(connection,DataTypes) {
	const Books = connection.define('books',
		{
			book_id: {
				type: DataTypes.INTEGER,
				validate: {
					notEmpty: true,
				}
			},
			title: {
				type: DataTypes.STRING
			},
			authors: {
				type: DataTypes.ARRAY(DataTypes.STRING)
			},
			publisher: {
				type: DataTypes.STRING
			},
            publication_date: {
                type: DataTypes.DATEONLY
            },
            language: {
                type: DataTypes.STRING
            },
            subjects: {
                type: DataTypes.ARRAY(DataTypes.STRING)
            },
            license_rights: {
                type: DataTypes.STRING
            }
		}
	);
	return Books;
};
