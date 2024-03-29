class Functions {
    fs = require('fs');
    xlsx = require('xlsx');
    UserAgent = require('user-agents');
    CliProgress = require('cli-progress');
    axios = require('axios');
    logger = require('./Logger');

    sleepTime = 500;


    async writeJson(filepath, data) {
        const pathList = filepath.split('/');
        const filename = pathList.pop();
        const dirPath = pathList.join('/');
        if(!this.fs.existsSync(dirPath)) {
            await this.fs.mkdir(dirPath, {recursive: true}, () => {});
        }

        await this.fs.writeFile(filepath.replace(/\.[\w\d]*/i, '') + '.json', JSON.stringify(data), () => {});
    }


    readJson(filepath) {
        if(this.fs.existsSync(filepath)) {
            return this.fs.readFileSync(filepath).toJSON();
        }

        return false;
    }


    /**
     * Возвращает текущую дату в формате YYYY-MM-DD
     *
     * @return {string}
     */
    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }


    /**
     * Создаёт объект для последующего создания множественных прогресс баров
     *
     * @returns {MultiBar}
     */
    initMultibar() {
        return new this.CliProgress.MultiBar({
            clearOnComplete: false,
            hideCursor: true
        }, this.CliProgress.Presets.shades_grey);
    }


    /**
     * Делает несколько попыток запроса по URL. Если ответ не будет получен возвращает false
     *
     * @param url       {string}        Строка запроса
     * @param config    {Object}        Кастомный конфиг для запроса
     * @param repeatTimes {int}         Количество повторений (При 10 работает хорошо)
     * @returns {Promise<AxiosResponse<any>|boolean>}
     */
    async tryGet(url, config = {}, repeatTimes = 1) {
        let response;

        for (let i = 0; i < repeatTimes; i++) {
            try {
                response = await this.get(url, config);
                return response;
            } catch (e) {
                await this.sleep(this.sleepTime)
            }
        }

        return false;
    }


    /**
     * Делает несколько попыток запроса по URL. Если ответ не будет получен возвращает false
     *
     * @param url       {string}        Строка запроса
     * @param data      {Object}        Тело запроса
     * @param config    {Object}        Кастомный конфиг для запроса
     * @param repeatTimes {int}         Количество повторных запросов
     * @returns {Promise<AxiosResponse<any>|boolean>}
     */
    async tryPost(url, data, config = {}, repeatTimes = 100) {
        let response;

        for (let i = 0; i < repeatTimes; i++) {
            try {
                response = await this.post(url, data, config);
                return response;
            } catch (e) {
                await this.sleep(this.sleepTime)
            }
        }

        return false;
    }


    /**
     * GET запрос с параметрами и стандартным таймаутом в 5 секунд
     *
     * @param url       {string}    Строка запроса
     * @param config    {Object}    Кастомный конфиг
     * @returns {Promise<AxiosResponse<any>>}
     */
    async get(url, config = {}) {
        const instance = this.axios.create();
        if(!('timeout' in config)) {
            config['timeout'] = 3000;
        }
        if(!('headers' in config)) {
            config['headers'] = {
                'User-agent': this.getUserAgent(),
            };
        }
        return await instance.get(encodeURI(url), config);
    }


    /**
     * POST запрос с параметрами и стандартным таймаутом в 5 секунд
     *
     * @param url       {string}    Строка запроса
     * @param data      {{Object}}  Тело запроса
     * @param config    {{Object}}  Кастомный конфиг
     * @returns {Promise<AxiosResponse<any>>}
     */
    async post(url, data, config = {}) {
        const instance = this.axios.create();
        if(!('timeout' in config)) {
            config['timeout'] = 3000;
        }
        if(!('headers' in config)) {
            config['headers'] = {
                'User-agent': this.getUserAgent(),
            };
        }

        return await instance.post(encodeURI(url), data, config);
    }


    /**
     * Останавливает программу
     *
     * @param ms {int} Количество милисекунд
     * @returns void
     */
    async sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }


    /**
     * Читает .xlsx файл постранично и возвращает объект
     *
     * @param filepath {string} Путь до файла
     * @returns {[Object]} Массив с объектами
     */
    readXLSX(filepath) {
        const file = this.xlsx.readFile(filepath);
        const sheets = file.Sheets;
        const data = [];

        for (const sheetName in sheets) {
            const sheet = sheets[sheetName];
            data[sheetName.trim()] = this.xlsx.utils.sheet_to_json(sheet);
        }

        return data;
    }

    /**
     * Создаёт .xlsx файл если его не существует из массива
     *
     * @param filepath {string} путь к файлу
     * @param data {array<Object>} массив с объектами
     * @param sheetName {string} название листа
     * @returns {Promise<void>}
     */
    // TODO: Использовать её везде кроме записи результатов парсинга
    async createXLSXAsync(filepath, data, sheetName) {
        let book;
        if(!this.fs.existsSync(filepath)) {
            const dirs = filepath.split('/');
            const filename = dirs.pop();
            if(dirs.length !== 0) {
                await this.fs.mkdir(dirs.join('/'), {recursive: true}, () => {});
            }

            book = this.xlsx.utils.book_new();
        } else {
            book = await this.xlsx.readFile(filepath);
        }

        const options = {
            // type: 'buffer', // С этим тоже работает
            type: 'string',
            bookType: 'xlsx',
        };

        if(sheetName in book.Sheets) {
            let sheet = book.Sheets[sheetName];
            const sheetData = this.xlsx.utils.sheet_to_json(sheet);
            data = [...data, ...sheetData];
            book.Sheets[sheetName] = this.xlsx.utils.json_to_sheet(data);
        } else {
            const sheet = this.xlsx.utils.json_to_sheet(data);
            this.xlsx.utils.book_append_sheet(book, sheet, sheetName);
        }

        await this.xlsx.writeFileAsync(filepath.replace(/\.[\w\d]*/i ,'') + '.xlsx', book, options, () => {});
    }

    /**
     * Создаёт .xlsx файл если его не существует из объекта
     *
     * @param filepath  {string} Путь до файла (с расширением .xlsx!)
     * @param data      {Object<[]>}  Ключ - название листа, значение - массив данных для записи
     */
    async createXLSCFromObjectAsync(filepath, data) {
        if(this.fs.existsSync(filepath)) return;

        const dirs = filepath.split('/');
        const filename = dirs.pop();
        if(dirs.length !== 0) {
            await this.fs.mkdir(dirs.join('/'), {recursive: true}, () => {});
        }

        const book = this.xlsx.utils.book_new();

        const options = {
            // type: 'buffer', // С этим тоже работает
            type: 'string',
            bookType: 'xlsx',
        };

        let notEmptyPages = 0;
        for (const page in data) {
            if(data[page].length === 0) {
                continue;
            }
            const sheet = this.xlsx.utils.json_to_sheet(data[page]);
            this.xlsx.utils.book_append_sheet(book, sheet, page);
            notEmptyPages++;
        }

        if(notEmptyPages > 0) {
            await this.xlsx.writeFileAsync(filepath, book, options, () => {});
        }
    }


    /**
     * Создаёт .xlsx файл если его не существует из объекта
     *
     * @param filepath  {string} Путь до файла (с расширением .xlsx!)
     * @param data      {Object<[]>}  Ключ - название листа, значение - массив данных для записи
     */
    async createSingleXLSCFromObjectAsync(filepath, data) {
        if(this.fs.existsSync(filepath)) return;

        const dirs = filepath.split('/');
        const filename = dirs.pop();
        if(dirs.length !== 0) {
            await this.fs.mkdir(dirs.join('/'), {recursive: true}, () => {});
        }

        const book = this.xlsx.utils.book_new();

        const options = {
            // type: 'buffer', // С этим тоже работает
            type: 'string',
            bookType: 'xlsx',
        };

        for (const page in data)
        {
            const vins = data[page];
            for (const vin in vins)
            {
                const details = vins[vin];
                if(details.length === 0) continue;
                const sheet = this.xlsx.utils.json_to_sheet(details);
                this.xlsx.utils.book_append_sheet(book, sheet, page);
            }
        }

        await this.xlsx.writeFileAsync(filepath, book, options, () => {});
    }


    /**
     * Генерирует случайный User-agent
     *
     * @returns {string}
     */
    getUserAgent() {
        return new this.UserAgent().toString();
    }
}

module.exports = new Functions();