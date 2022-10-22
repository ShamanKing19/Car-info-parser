class Functions {
    fs = require('fs');
    xlsx = require('xlsx');
    axios = require('axios');
    UserAgent = require('user-agents');
    CliProgress = require('cli-progress');


    sleepTime = 500;


    initMultibar() {
        return new this.CliProgress.MultiBar({
            clearOnComplete: false,
            hideCursor: true
        }, this.CliProgress.Presets.shades_grey);
    }

    async tryGet(url, pBar, params = {}, config = {}) {
        const repeatTimes = 10;
        let response;

        for (let i = 0; i < repeatTimes; i++) {
            try {
                response = await this.get(url, params, config);
                pBar.increment();
                return response;
            } catch (e) {
                await this.sleep(this.sleepTime)
            }
        }

        return false;
    }

    async tryPost(url, data, pBar, config = {}) {
        const repeatTimes = 100;
        let response;

        for (let i = 0; i < repeatTimes; i++) {
            try {
                response = await this.post(url, data, config);
                pBar.increment();
                return response;
            } catch (e) {
                await this.sleep(this.sleepTime)
            }
        }

        return false;
    }

    async get(url, params = {}, config = {}) {
        const instance = this.axios.create();
        config.params = params;
        config.timeout = 5000;
        config.headers = {
            "User-agent": new this.UserAgent().toString(),
        };

        return await instance.get(encodeURI(url), config);
    }

    async post(url, data, config = {}) {
        const instance = this.axios.create();
        config.timeout = 5000;
        config.headers = {
            "User-agent": new this.UserAgent().toString(),
        };

        return await instance.post(encodeURI(url), data, config);
    }

    /**
     * Останавливает программу
     *
     * @param ms        Количество милисекунд
     * @returns void
     */
    async sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }


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
    async createXLSX(filepath, data) {
        if (this.fs.existsSync(filepath)) return;

        const dirs = filepath.split('/');
        const filename = dirs.pop();
        this.fs.mkdirSync(dirs.join('/'), {recursive: true});

        const book = this.xlsx.utils.book_new();

        const options = {
            // type: 'buffer', // С этим тоже работает
            type: 'string',
            bookType: 'xlsx',
        };

        if (Array.isArray(data)) {
            const xlsxData = this.xlsx.utils.json_to_sheet(data);
            this.xlsx.utils.book_append_sheet(book, xlsxData);
        } else if (typeof data === 'object') {
            for (const page in data) {
                const xlsxData = this.xlsx.utils.json_to_sheet(data[page]);
                this.xlsx.utils.book_append_sheet(book, xlsxData, page);
            }
        }

        await this.xlsx.writeFileAsync(filepath, book, options, () => {});
    }
}

module.exports = Functions;