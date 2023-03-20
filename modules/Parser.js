class Parser
{
    Car = require('./../models/Car');
    Detail = require('./../models/Detail');

    Autodoc = require('./../parsers/Autodoc');
    Emex = require('./../parsers/Emex');


    constructor() {
        this.functions = require('./Functions');
        this.logger = require('./Logger');
        this.settings = require('./Settings').get();
        this.vins = [];
        this.details = [];
        this.parsers = [];
    }


    /**
     * Инициализация парсеров с учётом настроек
     *
     * @param settings  {Object}    Настройки для парсеров
     * @returns {Promise<void>}
     */
    async init() {
        await this.createInputFiles();
        this.vins = this.getVins();
        this.details = this.getDetails();
        await this.startParsers();
    }


    /**
     * Создаёт асинхронные задачи и прогресс бары для парсеров
     *
     * @returns {Promise<void>}
     */
    async startParsers() {
        const multibar = this.functions.initMultibar();
        const vinRequests = [];

        for(const car of this.vins) {
            if(this.settings.PARSERS.AUTODOC === 'Y') {
                const autodoc = new this.Autodoc(car);
                this.parsers.push(autodoc);
            }

            if(this.settings.PARSERS.EMEX === 'Y') {
                const emex = new this.Emex(car);
                this.parsers.push(emex);
            }
        }

        if(this.settings.STARTUP.START_FROM_VINS === 'Y') {
            const vinRequests = [];
            for(const parser of this.parsers) {
                vinRequests.push(parser.parseVin());
            }
        }

        const vinResults = await Promise.all(vinRequests);

        return;
        // Старт с VIN номеров
        if(this.settings.STARTUP.START_FROM_VINS === 'Y') {
            for(const sheet in vins) {
                for(const row of vins[sheet]) {
                    const vin = row.VINS;

                    if(this.settings.PARSERS.AUTODOC === 'Y') {
                        const pBar = multibar.create(1, 0, {
                            speed: 'N/A'
                        }, {
                            format: `{bar} | {percentage}% | {value}/{total} | ${vin} | autodoc.ru`,
                        });
                        this.autodoc.setProgressBar(pBar);
                    }
                    if(this.settings.PARSERS.EMEX === 'Y') {
                        const pBar = multibar.create(1, 0, {
                            speed: 'N/A'
                        }, {
                            format: `{bar} | {percentage}% | {value}/{total} | ${vin} | emex.ru`,
                        });
                        this.emex.setProgressBar(pBar);
                    }

                    vinRequests.push(this.parseVins(vin));
                }
            }

            const vinsData = await Promise.all(vinRequests);
            multibar.stop();

            if(this.settings.OUTPUT.VINS_RESULT_IN_ONE_FILE === 'Y') {
                const date = this.functions.getCurrentDate();
                const outputDir = this.settings.INPUT.DIRNAME;
                await this.functions.createXLSCFromObjectAsync(`${outputDir}/${date} details.xlsx`, this.vinsAndPartsObj);
            }
        } else {
            // Старт со списка деталей
            const detailsRequests = [];

            if(this.settings.PARSERS.EMEX === 'Y') {
                // Установка изначальной порционности для emex.ru
                for(const sheet in allDetails) {
                    this.emex.runningParsersCount++;
                }
            }

            for(const sheet in allDetails) {
                const vin = sheet;
                const details = allDetails[sheet];
                const pBars = {};

                if(this.settings.PARSERS.AUTODOC === 'Y') {
                    pBars['AUTODOC'] = multibar.create(1, 0, {
                        speed: 'N/A'
                    }, {
                        format: `{bar} | {percentage}% | {value}/{total} | ${vin} | autodoc.ru`,
                    });
                }
                if(this.settings.PARSERS.EMEX === 'Y') {
                    pBars['EMEX'] = multibar.create(1, 0, {
                        speed: 'N/A'
                    }, {
                        format: `{bar} | {percentage}% | {value}/{total} | ${vin} | emex.ru`,
                    });
                }
                detailsRequests.push(this.parseDetails(vin, details, pBars));
            }

            const details = await Promise.all(detailsRequests);

            if(this.settings.OUTPUT.DETAILS_RESULT_IN_ONE_FILE === 'Y') {
                const date = this.functions.getCurrentDate();
                const outputDir = this.settings.OUTPUT.DIRNAME;
                await this.functions.createXLSCFromObjectAsync(`${outputDir}/${date} DETAILS.xlsx`, this.offersObj);
            }
        }
        console.log('\n\n\n\n\nПарсинг завершён!');
    }


    /**
     * Сначала ищет набор деталей по VIN номеру, а потом предложения о покупке
     *
     * @param vin   {string}                                           VIN номер
     * @returns     {Promise<{vin: {}}>}
     */
    async parseVins(vin) {
        const car = await this.autodoc.parseVin(vin);
        await this.logger.log(`Надено ${car.details.length} деталей по ${car.vin}`);

        if(this.settings.OUTPUT.CREATE_DETAILS_FILE === 'Y')
        {
            const date = this.functions.getCurrentDate();

            if(this.settings.OUTPUT.VINS_RESULT_IN_ONE_FILE === 'Y') {
                this.vinsAndPartsObj[vin] = detailsInfo;
            } else {
                const outputList = {};
                outputList[vin] = detailsInfo;
                const outputDir = this.settings.INPUT.DIRNAME;
                await this.functions.createXLSCFromObjectAsync(`${outputDir}/${date} ${vin} details.xlsx`, outputList);
            }
        }

        const detailOffers = await this.parseDetails(vin, detailsInfo, pBars);
        return {
            vin: detailOffers
        };
    }

    /**
     * Запускает парсеры деталей
     *
     * @param vin       {string}                VIN номер
     * @param details   {Object[]}              Массив с деталями
     * @param pBars     {Object<{AUTODOC: GenericBar, EMEX: GenericBar}>}    Progress bar
     * @returns {Promise<{}>}           Объект, где ключ - номер детали, а значение - информация о деталях
     */
    async parseDetails(vin, details, pBars) {
        const detailsRequests = [];

        if(this.settings.PARSERS.AUTODOC === 'Y') {
            detailsRequests.push(this.autodoc.getDetailOffers(details, pBars['AUTODOC']));
        }

        if(this.settings.PARSERS.EMEX === 'Y') {
            detailsRequests.push(this.emex.getDetailOffers(details, pBars['EMEX'], vin));
        }

        let detailsResponses = await Promise.all(detailsRequests);
        let outputData = this.mergeResults(detailsResponses);

        if(this.settings.OUTPUT.COUNT_AVERAGE_PRICE === 'Y') {
            outputData = this.calculateAveragePrice(vin, outputData);
        } else {
            outputData = this.prepareToPrint(vin, outputData);
        }

        if(this.settings.OUTPUT.DETAILS_RESULT_IN_ONE_FILE === 'N') {
            const outputDir = this.settings.OUTPUT.DIRNAME;
            const today = this.functions.getCurrentDate();
            const filename = `${today} ${vin}.xlsx`;
            await this.functions.createXLSCFromObjectAsync(outputDir + '/' + filename, outputData);
        } else {
            this.offersObj[vin] = outputData[vin];
        }

        return outputData;
    }


    prepareToPrint(vin, details) {
        const outputData = {};
        outputData[vin] = [];
        for(const originalDetailNumber in details) {
            const detailInfo = details[originalDetailNumber];
            let originalDetailName = detailInfo['DETAIL_NAME'];

            if(detailInfo['DETAIL_OFFERS'].length === 0 && this.settings.SETTINGS.SHOW_IF_NOT_FOUND === 'Y') {
                outputData[vin].push({
                    'Искомый номер': originalDetailNumber,
                    'Номер': '',
                    'Название': originalDetailName,
                    'Цена': 'Нет в наличии',
                    'Доставка': '',
                    'Количество': '',
                    'Производитель': '',
                });
            } else {
                for(const offer of detailInfo['DETAIL_OFFERS']) {
                    const type = offer['TYPE'];
                    const detailNumber = offer['DETAIL_NUMBER'];
                    const detailName = offer['DETAIL_NAME'] ?? originalDetailName;
                    const price = offer['PRICE'];
                    const delivery = offer['DELIVERY'];
                    const quantity = offer['QUANTITY'];
                    const manufacturer = offer['MANUFACTURER'];

                    outputData[vin].push({
                        'Тип': type,
                        'Искомый номер': originalDetailNumber,
                        'Номер': detailNumber, // TODO: Пустота
                        'Название': originalDetailName ?? detailName,
                        'Цена': price ?? 0,
                        'Доставка': delivery ?? 0,
                        'Количество': quantity ?? 0,
                        'Производитель': manufacturer ?? '',
                    });
                }
            }
        }

        return outputData;
    }


    /**
     * Подсчитывает средние значения для каждой детали
     *
     * @param vin
     * @param details
     * @return {Promise<{vin: *[]}>}
     */
    calculateAveragePrice(vin, details) {
        const outputData = {};
        outputData[vin] = [];
        for(const detailNumber in details) {
            const detailInfo = details[detailNumber];

            if(detailInfo['DETAIL_OFFERS'].length === 0 && this.settings.SETTINGS.SHOW_IF_NOT_FOUND === 'N') {
                continue;
            }

            let sumPrice = 0;
            let sumDelivery = 0;
            detailInfo['DETAIL_OFFERS'] = detailInfo['DETAIL_OFFERS'].filter(item => item !== undefined);
            for(const offer of detailInfo['DETAIL_OFFERS']) {
                sumPrice += parseInt(offer['PRICE']);
                sumDelivery += parseInt(offer['DELIVERY']);
            }

            const detailName = detailInfo['DETAIL_NAME'];
            let avgPrice = '';
            let avgDelivery = '';
            if(detailInfo['DETAIL_OFFERS'].length !== 0) {
                avgPrice = sumPrice / detailInfo['DETAIL_OFFERS'].length;
                avgDelivery = sumDelivery / detailInfo['DETAIL_OFFERS'].length;
            } else {
                avgPrice = 'Нет в наличии';
            }

            outputData[vin].push({
                'Номер': detailNumber,
                'Название': detailName,
                'Средняя цена': avgPrice,
                'Среднее время доставки': avgDelivery
            });
        }
        return outputData;
    }


    /**
     * Объединяет объекты, возвращённые парсерами в один
     *
     * @param parserResults
     * @return {{}} Объект с деталями
     */
    mergeResults(parserResults) {
        const outputData = {};
        for(const result of parserResults) {
            for(const detailNumber in result) {
                if(!(detailNumber in outputData)) {
                    outputData[detailNumber] = {
                        'DETAIL_NUMBER': '',
                        'DETAIL_NAME': ''
                    };
                }
                if(!('DETAIL_OFFERS' in outputData[detailNumber])) {
                    outputData[detailNumber]['DETAIL_OFFERS'] = [];
                }

                const detailInfo = result[detailNumber];
                const detailName = detailInfo.DETAIL_NAME;
                const detailOffers = detailInfo.DETAIL_OFFERS;
                outputData[detailNumber]['ORIGINAL_DETAIL_NUMBER'] = detailInfo['ORIGINAL_DETAIL_NUMBER'];
                outputData[detailNumber]['ORIGINAL_DETAIL_NAME'] = detailInfo['ORIGINAL_DETAIL_NUMBER'];
                outputData[detailNumber]['DETAIL_NUMBER'] = detailNumber;
                outputData[detailNumber]['DETAIL_NAME'] = detailName;
                outputData[detailNumber]['DETAIL_OFFERS'] = outputData[detailNumber]['DETAIL_OFFERS'].concat(detailInfo.DETAIL_OFFERS);
            }
        }
        return outputData;
    }


    /**
     * Читает файл с VIN номерами
     *
     * @param filepath  {string}    Путь к файлу
     * @returns {Object[]}
     */
    getVins() {
        const path = this.settings.INPUT.DIRNAME + '/' + this.settings.INPUT.VINS_FILE;
        const fileData = this.functions.readXLSX(path);
        const vins = [];
        for(const page in fileData) {
            const pageData = fileData[page];
            for(const data of pageData) {
                vins.push(new this.Car(data['VINS']));

            }
        }
        return vins;
    }


    /**
     * Читает файл с деталями
     *
     * @param filepath  {string}    Путь к фалу
     * @returns {Object[]}
     */
    getDetails() {
        const path = this.settings.INPUT.DIRNAME + '/' + this.settings.INPUT.DETAILS_FILE;
        const details = [];
        const fileData = this.functions.readXLSX(path);
        for(const page in fileData) {
            const pageData = fileData[page];
            for(const data of pageData) {
                const detail = new this.Detail(data['DETAIL_NAME'] ?? '');
                detail.number = data['DETAIL_NUMBER'] ?? ''
                details.push(detail);
            }
        }

        return details;
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
        await this.functions.createXLSCFromObjectAsync(filepath, headers);
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
        await this.functions.createXLSCFromObjectAsync(filepath, headers);
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
                    // 'CATEGORY': '',
                    'DETAIL_NAME': '',
                    'DETAIL_NUMBER': ''
                }
            ]
        };
        await this.functions.createXLSCFromObjectAsync(filepath, headers);
    }

    async createInputFiles() {
        const inputDirname = this.settings.INPUT.DIRNAME;
        const vinsFile = this.settings.INPUT.VINS_FILE;
        const detailsFile = this.settings.INPUT.DETAILS_FILE;
        const accountsFile = this.settings.INPUT.ACCOUNTS;

        const vinsFilePath = `${inputDirname}/${vinsFile}`.replaceAll('//', '/');
        const detailsFilePath = `${inputDirname}/${detailsFile}`.replaceAll('//', '/');
        const accountsFilePath = `${inputDirname}/${accountsFile}`.replaceAll('//', '/');

        await this.createVinsInputFileIfNotExistsAsync(vinsFilePath);
        await this.createDetailsInputFileIfNotExistsAsync(detailsFilePath);
        await this.createAccountsFileIfNotExistsAsync(accountsFilePath);
    }
}

module.exports = new Parser();