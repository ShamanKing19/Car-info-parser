class Parser {
    Functions = require('./functions');
    Logger = require('./logger');
    Autodoc = require('./autodoc');
    Emex = require('./emex');

    settings;
    autodoc;
    emex;

    vinsAndPartsObj = {}; // Для записи в один файл

    constructor(settings) {
        this.settings = settings;
        this.functions = new this.Functions();
        this.logger = new this.Logger();
    }

    async init() {
        const inputDirname = this.settings.INPUT.DIRNAME;
        const vinsFile = this.settings.INPUT.VINS_FILE;
        const detailsFile = this.settings.INPUT.DETAILS_FILE;
        const accountsFile = this.settings.INPUT.ACCOUNTS;

        const createVinsFile = this.settings.OUTPUT.CREATE_VINS_FILE;
        const oneVinsFile = this.settings.OUTPUT.VINS_RESULT_IN_ONE_FILE;

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
            CREATE_VINS_FILE: createVinsFile,
            VINS_RESULT_IN_ONE_FILE: oneVinsFile,

            AUTODOC: useAutodocParser,
            EMEX: useEmexParser,
        };

        await this.run(data);
    }


    async run(data) {
        const multibar = this.functions.initMultibar();
        const vinRequests = [];

        if (data.START_FROM_VINS === 'Y')
        {
            for (const sheet in data.VINS)
            {
                for (const row of data.VINS[sheet])
                {
                   const bar = multibar.create(1, 0, {
                       speed: "N/A"
                   });

                    const vin = row.VINS;
                    const vinRequest = this.parseVin(vin, bar, data);
                    vinRequests.push(vinRequest);
                }
            }

            const vinsData = await Promise.all(vinRequests);
            multibar.stop();

            if (data.VINS_RESULT_IN_ONE_FILE === 'Y') {
                const date = new Date().toISOString().split('T')[0];
                await this.functions.createXLSX(`output/${date} VINS.xlsx`, this.vinsAndPartsObj);
            }

        } else {
            // Тут на парсинг сразу отправляются детали
        }
        console.log('Парсинг завершён!');
    }


    async parseVin(vin, pBar, settings) {
        const clientId = Math.floor(Math.random() * 500);
        const carPrimaryInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/cars/${vin}/modifications?clientId=${clientId}`

        const vinResponse = await this.functions.tryGet(carPrimaryInfoUrl, pBar);
        pBar.update(0);

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

        pBar.setTotal(1);
        const categoriesUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${carCatalog}/cars/${carId}/categories?ssd=${carSsd}`;
        const categoriesResponse = await this.functions.tryGet(categoriesUrl, pBar);
        pBar.update(0);

        if (!categoriesResponse) return [];

        let rawCategories = categoriesResponse.data;

        if ('items' in rawCategories) {
           rawCategories = rawCategories['items'];
        }

        // Сохранение всех подкатегорий в один массив
        const categories = this.getSubcategories(rawCategories);
        const categoryRequests = [];
        let categoryIterations = 0;

        for (const category of categories) {
            const categoryId = category['categoryId'];
            const categorySsd = category['ssd'];
            const categoryName = category['name'];

            const sparePartInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${carCatalog}/cars/${carId}/categories/${categoryId}/units?ssd=${categorySsd}`;

            // TODO: Здесь подцеплять название категории categoryName
            const categoryRequest = this.functions.tryGet(sparePartInfoUrl, pBar);
            categoryRequests.push(categoryRequest);
            categoryIterations++;
        }

        pBar.setTotal(categoryIterations);
        const categoryResponses = await Promise.all(categoryRequests);
        pBar.update(0);

        const sparePartDetailInfoRequests = [];
        let detailsIterationCount = 0;

        for (const response of categoryResponses)
        {
            if (!response) continue;
            const sparePartItems = response.data['items'];
            if (!sparePartItems) continue;

            for (const sparePartItem of sparePartItems)
            {
                const unitId = sparePartItem['unitId'];
                const unitSsd = sparePartItem['ssd'];

                const sparePartDetailInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${carCatalog}/cars/${carId}/units/${unitId}/spareparts?ssd=${unitSsd}`;
                const sparePartData = {'Ssd': unitSsd};

                const sparePartDetailInfoRequest = this.functions.tryPost(sparePartDetailInfoUrl, sparePartData, pBar);
                sparePartDetailInfoRequests.push(sparePartDetailInfoRequest);
                detailsIterationCount++;
            }
        }

        pBar.setTotal(detailsIterationCount);
        const sparePartDetailInfoResponses = await Promise.all(sparePartDetailInfoRequests);
        pBar.update(0);

        const uniqueParts = [];
        const detailsInfo = [];

        for (const response of sparePartDetailInfoResponses)
        {
            if (!response) continue;
            const parts = response.data['items'];
            if (!parts) continue;

            for (const part of parts)
            {
                // TODO: Походу приходит говно с какими-то символами, которые крашат excel и не отображаются в ячейках
                const partNumber = part['partNumber'];
                const partName = part['name'];

                // TODO: Выводить категорию
                if (!uniqueParts.includes(partNumber)) {
                    const partInfo = {
                      PART_NAME: partName,
                      PART_NUMBER: partNumber,
                    };

                    detailsInfo.push(partInfo);
                    uniqueParts.push(partNumber);
                }
            }
        }

        if (settings.CREATE_VINS_FILE === 'Y') {
            const date = new Date().toISOString().split('T')[0];
            if (settings.VINS_RESULT_IN_ONE_FILE === 'Y') {
                this.vinsAndPartsObj[vin] = detailsInfo;
            } else {
                await this.functions.createXLSX(`output/${date} ${vin} details.xlsx`, {vin: detailsInfo});
            }
        }

        const detailOffers = await this.getDetailOffers(detailsInfo, settings);

    }

    async getDetailOffers(detailInfo, settings) {

    }


    parseDetails(vin, bar, data) {

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