class Functions {
    fs = require('fs');
    xlsx = require('xlsx');


    /**
     * Читает .xlsx файл постранично и возвращает объект
     *
     * @param filepath  Путь до файла
     * @returns {*[]}   Массив с объектами
     */
    readXLSX(filepath) {
        const file = this.xlsx.readFile(filepath);
        const sheets = file.Sheets;
        let data = [];

        for (const sheetName in sheets) {
            const sheet = sheets[sheetName];
            data[sheetName] = this.xlsx.utils.sheet_to_json(sheet);
        }

        return data;
    }


    /**
     * Создаёт .xlsx файл если его не существует
     *
     * @param filepath  Путь до файла
     * @param data      Массив с объектами
     */
    createXLSX(filepath, data) {
        if (this.fs.existsSync(filepath)) return;

        const dirs = filepath.split('/');
        const filename = dirs.pop();
        this.fs.mkdirSync(dirs.join('/'), {recursive: true});

        const xlsxData = this.xlsx.utils.json_to_sheet(data);
        const book = this.xlsx.utils.book_new();

        this.xlsx.utils.book_append_sheet(book, xlsxData);
        this.xlsx.writeFileXLSX(book, filepath);
    }
}

module.exports = Functions;