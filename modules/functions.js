class Functions {
    fs = require('fs');
    xlsx = require('xlsx');
    axios = require('axios');
    UserAgent = require('user-agents');
    CliProgress = require('cli-progress');

    sleepTime = 500;

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
     * @returns {Promise<AxiosResponse<any>|boolean>}
     */
    async tryGet(url, config = {}) {
        const repeatTimes = 1; // При 10 работает хорошо
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
     * @returns {Promise<AxiosResponse<any>|boolean>}
     */
    async tryPost(url, data, config = {}) {
        const repeatTimes = 100;
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
        if (!('timeout' in config)) {
            config['timeout'] = 3000;
        }
        if (!('headers' in config)) {
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
        if (!('timeout' in config)) {
            config['timeout'] = 3000;
        }
        if (!('headers' in config)) {
            config['headers'] = {
                "User-agent": this.getUserAgent(),
            };
        }

        return await instance.post(encodeURI(url), data, config);
    }


    /**
     * Останавливает программу
     *
     * @param ms        {int}   Количество милисекунд
     * @returns void
     */
    async sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }


    /**
     * Читает .xlsx файл постранично и возвращает объект
     *
     * @param filepath  {string}  Путь до файла
     * @returns {[Object]}   Массив с объектами
     */
    readXLSX(filepath) {
        const file = this.xlsx.readFile(filepath);
        const sheets = file.Sheets;
        const data = [];

        for (const sheetName in sheets) {
            const sheet = sheets[sheetName];
            data[sheetName] = this.xlsx.utils.sheet_to_json(sheet);
        }

        return data;
    }


    /**
     * Создаёт .xlsx файл если его не существует
     *
     * @param filepath  {string} Путь до файла (с расширением .xlsx!)
     * @param data      {Object<[]>}  Ключ - название листа, значение - массив данных для записи
     */
    async createXLSXAsync(filepath, data) {
        if (this.fs.existsSync(filepath)) return;

        const dirs = filepath.split('/');
        const filename = dirs.pop();
        if (dirs.length !== 0) {
            await this.fs.mkdir(dirs.join('/'), {recursive: true}, () => {});
        }

        const book = this.xlsx.utils.book_new();

        const options = {
            // type: 'buffer', // С этим тоже работает
            type: 'string',
            bookType: 'xlsx',
        };

        for (const page in data) {
            const xlsxData = this.xlsx.utils.json_to_sheet(data[page]);
            this.xlsx.utils.book_append_sheet(book, xlsxData, page);
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