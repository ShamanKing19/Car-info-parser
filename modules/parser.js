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

        let vins = [];
        let accounts = [];
        let details = [];

        if (startFromVins === "Y") {
            vins = await this.getVins(vinsFilePath);
        } else {
            details = await this.getDetails(detailsFilePath);
        }

        if (useAutodocParser === "Y") {
            accounts = await this.getAccounts(accountsFilePath);
            this.autodoc = require('./autodoc');
        }

        if (useEmexParser === 'Y') {
            this.emex = require('./emex');
        }

        const data = {
            VINS: vins,
            DETAILS: details,
            ACCOUNTS: accounts,

            START_FROM_VINS: startFromVins,
            CREATE_VINS_FILE: createVinsFile,
            VINS_RESULT_IN_ONE_FILE: oneVinsFile,

            AUTODOC: useAutodocParser,
            EMEX: useEmexParser,
        };

        await this.startParsers(data);
    }


    /**
     * Создаёт асинхронные задачи и прогресс бары для парсеров
     *
     * @param settings  {Object}    Настройки для парсеров
     * @returns {Promise<void>}
     */
    async startParsers(settings) {
        const multibar = this.functions.initMultibar();
        const vinRequests = [];

        if (settings.START_FROM_VINS === 'Y')
        {
            for (const sheet in settings.VINS)
            {
                for (const row of settings.VINS[sheet])
                {
                    const vin = row.VINS;
                    const bar = multibar.create(1, 0, {
                        speed: "N/A"
                    });

                    vinRequests.push(this.parseVins(vin, bar, settings));
                }
            }

            const vinsData = await Promise.all(vinRequests);
            multibar.stop();

            if (settings.VINS_RESULT_IN_ONE_FILE === 'Y') {
                const date = new Date().toISOString().split('T')[0];
                await this.functions.createXLSXAsync(`output/${date} VINS.xlsx`, this.vinsAndPartsObj);
            }
        } else {
            const detailSheets = settings.DETAILS;
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
     * @param settings  {Object}        Настройки
     * @returns {Promise<void>}
     */
    async parseVins(vin, pBar, settings) {

        const detailsInfo = await this.autodoc.parseVin(vin, pBar);

        if (settings.CREATE_VINS_FILE === 'Y')
        {
            const date = new Date().toISOString().split('T')[0];

            if (settings.VINS_RESULT_IN_ONE_FILE === 'Y') {
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
     * @param pBar      {GenericBar}
     * @returns {Promise<void>}
     */
    async parseDetails(vin, details, pBar) {

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