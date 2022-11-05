class Parser {
    vinsAndPartsObj = {}; // Для записи в один файл
    autodoc;
    emex;


    constructor() {
        this.functions = require(__dirname + '/functions');
        this.logger = require(__dirname + '/logger');
    }


    /**
     * Инициализация парсеров с учётом настроек
     *
     * @param settings  {Object}    Настройки для парсеров
     * @returns {Promise<void>}
     */
    async init(settings) {
        const inputDirname = settings.INPUT.DIRNAME;
        const vinsFile = settings.INPUT.VINS_FILE;
        const detailsFile = settings.INPUT.DETAILS_FILE;
        const accountsFile = settings.INPUT.ACCOUNTS;

        const createVinsFile = settings.OUTPUT.CREATE_VINS_FILE;
        const oneVinsFile = settings.OUTPUT.VINS_RESULT_IN_ONE_FILE;

        const startFromVins = settings.STARTUP.START_FROM_VINS;

        const useAutodocParser = settings.PARSERS.AUTODOC;
        const useEmexParser = settings.PARSERS.EMEX;

        const vinsFilePath = `${inputDirname}/${vinsFile}`.replaceAll('//', '/');
        const detailsFilePath = `${inputDirname}/${detailsFile}`.replaceAll('//', '/');
        const accountsFilePath = `${inputDirname}/${accountsFile}`.replaceAll('//', '/');

        this.settings = settings;

        let vins = [];
        let accounts = [];
        let details = [];

        if (startFromVins === "Y") {
            this.autodoc = require('./autodoc'); // Нахождение номеров деталей только через autodoc.ru
            this.autodoc.settings = settings;
            vins = await this.getVins(vinsFilePath);
        } else {
            details = await this.getDetails(detailsFilePath);
        }

        if (useAutodocParser === "Y") {
            this.autodoc = require('./autodoc'); // Нахождение номеров деталей только через autodoc.ru
            accounts = await this.getAccounts(accountsFilePath);
            this.autodoc.settings = settings;
        }

        if (useEmexParser === 'Y') {
            this.emex = require('./emex');
            this.emex.settings = settings;
        }

        await this.startParsers(vins, details, accounts);
    }


    /**
     * Создаёт асинхронные задачи и прогресс бары для парсеров
     *
     * @returns {Promise<void>}
     */
    async startParsers(vins, details, accounts) {
        const multibar = this.functions.initMultibar();
        const vinRequests = [];

        if (this.settings.STARTUP.START_FROM_VINS === 'Y')
        {
            for (const sheet in vins)
            {
                for (const row of vins[sheet])
                {
                    const vin = row.VINS;
                    const bar = multibar.create(1, 0, {
                        speed: "N/A"
                    });
                    vinRequests.push(this.parseVins(vin, bar));
                }
            }

            const vinsData = await Promise.all(vinRequests);
            multibar.stop();

            if (this.settings.VINS_RESULT_IN_ONE_FILE === 'Y') {
                const date = new Date().toISOString().split('T')[0];
                await this.functions.createXLSXAsync(`output/${date} VINS.xlsx`, this.vinsAndPartsObj);
            }
        } else {
            const detailSheets = this.settings.DETAILS;
            const detailsRequests = [];

            for (const sheet in detailSheets) {
                const vin = sheet;
                const details = detailSheets[sheet];
                const bar = multibar.create(1, 0, {
                    speed: "N/A"
                });

                detailsRequests.push(this.parseDetails(vin, details, bar));
            }

            const details = await Promise.all(detailsRequests);
        }
        console.log('Парсинг завершён!');
    }


    /**
     * Сначала ищет набор деталей по VIN номеру, а потом предложения о покупке
     *
     * @param vin       {string}        VIN номер
     * @param pBar      {GenericBar}    Progress bar
     * @returns {Promise<void>}
     */
    async parseVins(vin, pBar) {
        const detailsInfo = await this.autodoc.parseVin(vin, pBar);

        if (this.settings.CREATE_VINS_FILE === 'Y')
        {
            const date = new Date().toISOString().split('T')[0];

            if (this.settings.VINS_RESULT_IN_ONE_FILE === 'Y') {
                this.vinsAndPartsObj[vin] = detailsInfo;
            } else {
                const outputList = {};
                outputList[vin] = detailsInfo;
                await this.functions.createXLSXAsync(`output/${date} ${vin} details.xlsx`, outputList);
            }
        }

        const detailOffers = await this.parseDetails(vin, detailsInfo, pBar);
    }

    /**
     * Запускает парсеры деталей
     *
     * @param vin       {string}        VIN номер
     * @param details   {Object[]}      Массив с деталями
     * @param pBar      {GenericBar}    Progress bar
     * @returns {Promise<void>}
     */
    async parseDetails(vin, details, pBar) {
        const detailsRequests = [];

        if (this.settings.PARSERS.EMEX === 'Y') {
            detailsRequests.push(this.emex.getDetailOffers(details, pBar));
        }
        if (this.settings.PARSERS.AUTODOC === 'Y') {
            detailsRequests.push(this.autodoc.getDetailOffers(details, pBar));
        }

        const results = await Promise.all(detailsRequests);
        this.logger.json('offers', results);
    }


    /**
     * Читает файл с аккаунтами для autodoc.ru
     *
     * @param filepath  {string}    Путь к файлу
     * @returns {Promise<Object[]>}
     */
    async getAccounts(filepath) {
        await this.createAccountsFileIfNotExistsAsync(filepath);
        return this.functions.readXLSX(filepath);
    }


    /**
     * Читает файл с VIN номерами
     *
     * @param filepath  {string}    Путь к файлу
     * @returns {Promise<Object[]>}
     */
    async getVins(filepath) {
        await this.createVinsInputFileIfNotExistsAsync(filepath);
        return this.functions.readXLSX(filepath);
    }

    /**
     * Читает файл с деталями
     *
     * @param filepath  {string}    Путь к фалу
     * @returns {Promise<Object[]>}
     */
    async getDetails(filepath) {
        await this.createDetailsInputFileIfNotExistsAsync(filepath);
        return this.functions.readXLSX(filepath);
    }


    /**
     * Создаёт файл с VIN номерами если его нет
     *
     * @param filepath  {string}    Путь к файлу
     * @returns {Promise<void>}
     */
    async createVinsInputFileIfNotExistsAsync(filepath) {
        const headers = {
            'VINS': [
                {
                    'VINS': ''
                }
            ]
        };
        await this.functions.createXLSXAsync(filepath, headers);
    }


    /**
     * Создаёт файл с деталями если его нет
     *
     * @param filepath  {string}    Путь к файлу
     * @returns {Promise<void>}
     */
    async createDetailsInputFileIfNotExistsAsync(filepath) {
        const headers = {
            'DETAILS' : [
                {
                    'CATEGORY': '',
                    'DETAIL_NAME': '',
                    'DETAIL_NUMBER': ''
                }
            ]
        };
        await this.functions.createXLSXAsync(filepath, headers);
    }


    /**
     * Создаёт файл с аккаутнами если его нет
     *
     * @param filepath  {string}    Путь к файлу
     * @returns {Promise<void>}
     */
    async createAccountsFileIfNotExistsAsync(filepath) {
        const headers = {
            'ACCOUNTS': [
                {
                    'LOGIN': '',
                    'PASSWORD': ''
                }
            ]
        };
        await this.functions.createXLSXAsync(filepath, headers);
    }

}

module.exports = new Parser();