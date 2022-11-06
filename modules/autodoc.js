class Autodoc {
    accounts;
    settings;

    constructor(accounts) {
        this.accounts = accounts;
        this.functions = require('./functions');
        this.logger = require('./logger');
    }


    /**
     *  Ищет детали по VIN номеру
     *
     * @param vin     {string}      VIN номер
     * @param pBar    {GenericBar}  Progressbar из библиотеки cli-progress
     * @returns {Promise<*[]>}      Список объектов с номером и названием детали
     */
    async parseVin(vin, pBar) {
        const clientId = Math.floor(Math.random() * 500);
        const carPrimaryInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/cars/${vin}/modifications?clientId=${clientId}`

        const vinResponse = await this.makeGetRequest(carPrimaryInfoUrl, pBar);
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
        const categoriesResponse = await this.makeGetRequest(categoriesUrl, pBar);
        pBar.update(0);

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

            // TODO: Здесь подцеплять название категории categoryName
            const categoryRequest = this.makeGetRequest(sparePartInfoUrl, pBar);
            categoryRequests.push(categoryRequest);
        }

        pBar.setTotal(categories.length);
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

                const sparePartDetailInfoRequest = this.makePostRequest(sparePartDetailInfoUrl, sparePartData, pBar);
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

        return detailsInfo;
    }

    /**
     * Рекурсивно вытаскивает все подкатегории в общий массив
     *
     * @param categories    Массив с объектами категорий, прилетающих с autodoc.ru
     * @returns             Массив с категориями
     */
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


    async makePostRequest(sparePartDetailInfoUrl, sparePartData, pBar) {
        const response = await this.functions.tryPost(sparePartDetailInfoUrl, sparePartData);
        pBar.increment();
        return response;
    }


    async makeGetRequest(url, pBar) {
        const response = await this.functions.tryGet(url);
        pBar.increment();
        return response;
    }
}

module.exports = new Autodoc();