class Parser {
    Functions = require('./functions');
    Logger = require('./logger');
    Autodoc = require('./autodoc');
    Emex = require('./emex');

    settings;
    autodoc;
    emex;

    constructor(settings) {
        this.settings = settings;
        this.functions = new this.Functions();
        this.logger = new this.Logger();
    }

    async run() {
        const inputDirname = this.settings.INPUT.DIRNAME;
        const vinsFile = this.settings.INPUT.VINS_FILE;
        const detailsFile = this.settings.INPUT.DETAILS_FILE;
        const accountsFile = this.settings.INPUT.ACCOUNTS;
        const startFromVins = this.settings.STARTUP.START_FROM_VINS;
        const useAutodocParser = this.settings.PARSERS.AUTODOC;
        const useEmexParser = this.settings.PARSERS.EMEX;

        const vinsFilePath = `${inputDirname}/${vinsFile}`.replaceAll('//', '/');
        const detailsFilePath = `${inputDirname}/${detailsFile}`.replaceAll('//', '/');
        const accountsFilePath = `${inputDirname}/${accountsFile}`.replaceAll('//', '/');

        let vins = [];
        let accounts = [];
        let details = [];

        if (startFromVins === "Y") {
            vins = this.getVins(vinsFilePath);
        } else {
            details = this.getDetails(detailsFilePath);
        }

        if (useAutodocParser === "Y") {
            accounts = this.getAccounts(accountsFilePath);
            this.autodoc = new this.Autodoc(accounts);
        }

        if (useEmexParser === 'Y') {
            this.emex = new this.Emex();
        }


        const data = {
            VINS: vins,
            DETAILS: details,
            ACCOUNTS: accounts,

            START_FROM_VINS: startFromVins,

            AUTODOC: useAutodocParser,
            EMEX: useEmexParser,
        };

        await this.startParsing(data);
    }


    async startParsing(data) {
        const vinRequests = [];

        if (data.START_FROM_VINS === 'Y')
        {
            for (const sheet in data.VINS)
            {
                for (const row of data.VINS[sheet])
                {
                    const vin = row.VINS;
                    const vinRequest = this.parseVin(vin);
                    vinRequests.push(vinRequest);
                    break; // DEV
                }
            }

            const vinsData = await Promise.all(vinRequests);

        } else {
            // Тут на парсинг сразу отправляются детали
        }
        console.log('Парсинг завершён!');
    }


    async parseVin(vin) {
        const clientId = Math.floor(Math.random() * 500);
        const carPrimaryInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/cars/${vin}/modifications?clientId=${clientId}`

        const vinResponse = await this.functions.tryGet(carPrimaryInfoUrl);

        if (!vinResponse) return [];

        const vinData = vinResponse.data;
        const primaryData = vinData['commonAttributes'];
        const modifications = vinData['specificAttributes'];

        if (!primaryData) {
            this.logger.log(`No primary data at ${vin}`);
            return [];
        }


        // TODO: Тут можно собирать инфу по разным модификациям автомобиля (пока что беру только первую)
        if (Array.isArray(modifications) && modifications.length > 0) {
            for (const item of modifications[0]['attributes']) {
                primaryData.push(item);
            }
        }

        const carInfo = {};

        // Формирование удобного объекта из полученных данных
        for (const property of primaryData) {
            carInfo[property['key']] = property['value'];
        }

        // Получение категорий автомобиля
        const carId = carInfo['CarID'];
        const carSsd = carInfo['Ssd'];
        const carCatalog = carInfo['Catalog'];
        const carModel = carInfo['Model']; // Может быть пустым

        const categoriesUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${carCatalog}/cars/${carId}/categories?ssd=${carSsd}`;

        let categoriesResponse = await this.functions.tryGet(categoriesUrl);

        if (!categoriesResponse) return [];

        let rawCategories = categoriesResponse.data;

        if ('items' in rawCategories) {
           rawCategories = rawCategories['items'];
        }

        // Сохранение всех подкатегорий в один массив
        const categories = this.getSubcategories(rawCategories);

        const categoryRequests = [];
        for (const category of categories) {
            const categoryId = category['categoryId'];
            const categorySsd = category['ssd'];
            const categoryName = category['name'];

            const sparePartInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${carCatalog}/cars/${carId}/categories/${categoryId}/units?ssd=${categorySsd}`;

            const categoryRequest = this.functions.tryGet(sparePartInfoUrl);
            categoryRequests.push(categoryRequest);
        }

        const categoryResponses = await Promise.all(categoryRequests);

        const sparePartDetailInfoRequests = [];
        for (const response of categoryResponses)
        {
            if (!response) continue;

            const sparePartItems = response.data['items'];

            for (const sparePartItem of sparePartItems) {

                const unitId = sparePartItem['unitId'];
                const unitSsd = sparePartItem['ssd'];

                const sparePartDetailInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${carCatalog}/cars/${carId}/units/${unitId}/spareparts?ssd=${unitSsd}`;
                const sparePartData = {
                    'Ssd': unitSsd
                };

                const sparePartDetailInfoRequest = this.functions.tryPost(sparePartDetailInfoUrl, sparePartData);
                sparePartDetailInfoRequests.push(sparePartDetailInfoRequest);
            }
        }

        const sparePartDetailInfoResponses = await Promise.all(sparePartDetailInfoRequests);

        const detailsInfo = [];
        for (const response of sparePartDetailInfoResponses)
        {
            if (!response) continue;

            const parts = response.data['items'];

            if (!parts) continue;

            for (const part of parts)
            {
                const partName = part['name'];
                const partNumber = part['partNumber'];
                const partAttributes = part['attributes']; // Содержит характеристики детали (вес, семейство, количество)

                const partInfo = {
                  PART_NAME: partName,
                  PART_NUMBER: partNumber,
                  PART_ATTRIBUTES: partAttributes
                };

                detailsInfo.push(partInfo);
                // this.getDetailOffers(partInfo);
            }
        }

        // await this.functions.createXLSX('output/test.xlsx', detailsInfo);
    }

    async getDetailOffers(detailInfo) {

    }


    getSubcategories(categories) {
        let items = [];

        for (const category of categories) {
            if (category['children'].length !== 0) {
                items = items.concat(this.getSubcategories(category['children']))
            } else {
                items.push(category);
            }
        }

        return items;
    }

    getAccounts(filepath) {
        this.createAccountsFileIfNotExists(filepath);
        return this.functions.readXLSX(filepath);
    }

    getVins(filepath) {
        this.createVinsInputFileIfNotExists(filepath);
        return this.functions.readXLSX(filepath);
    }

    getDetails(filepath) {
        this.createDetailsInputFileIfNotExists(filepath);
        return this.functions.readXLSX(filepath);
    }

    createVinsInputFileIfNotExists(filepath) {
        const headers = [
            {
                'VINS': ''
            }
        ];
        this.functions.createXLSX(filepath, headers);
    }

    createDetailsInputFileIfNotExists(filepath) {
        const headers = [
            {
                'CATEGORY': '',
                'DETAIL_NAME': '',
                'DETAIL_NUMBER': ''
            }
        ];
        this.functions.createXLSX(filepath, headers);
    }

    createAccountsFileIfNotExists(filepath) {
        const headers = [
            {
                'LOGIN': '',
                'PASSWORD': '',
            }
        ];
        this.functions.createXLSX(filepath, headers);
    }

}

module.exports = Parser;