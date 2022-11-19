class Autodoc {
    settings; // Устанавливаются вместе с инициализацией

    constructor() {
        this.functions = require('./functions');
        this.logger = require('./logger');
    }


    async getDetailOffers(details, account, pBar) {
        const loginAttempts = ["DC1/O1127x9ZL4GU2bhQgg==", "W7F+x+sPZUPsCAcXwYSH5Q=="];
        const randomIndex = Math.floor(Math.random() * loginAttempts.length);
        const attempt = loginAttempts[randomIndex];

        pBar.setTotal(3);

        const challengeGuid = await this.getChallengeGuid();
        pBar.increment();
        const tokenData = await this.getAuthToken(account);
        if (!tokenData) return false;
        pBar.increment();
        const session = await this.logIn(challengeGuid, tokenData, attempt, account);
        if (!session) return false;
        pBar.increment();

        const requests = [];
        pBar.setTotal(details.length);
        for (const detail of details) {
            requests.push(this.parseDetail(detail, session, attempt, pBar));
        }

        const responses = await Promise.all(requests);


    }


    async parseDetail(detail, session, attempt, pBar) {
        let detailNumber = detail['PART_NUMBER'];
        let detailName = detail['PART_NAME'];
        const clearDetailNumber = detailNumber.replaceAll('-', '').replaceAll(' ', '');

        const manufacturerList = await this.getManufacturerInfo(clearDetailNumber, session);

        if (!manufacturerList) return false;

        const requests = [];
        for (const manufacturer of manufacturerList) {
            const manufacturerId = manufacturer['id'];
            const manufacturerName = manufacturer['manufacturerName'];
            detailNumber = manufacturer['artNumber'] ?? detailNumber;
            detailName = manufacturer['partName'] ?? detailName;

            requests.push(this.getDetailInfoByManufacturer(session, manufacturerId, detailNumber, attempt, pBar));
        }

        const responses = await Promise.all(requests);
    }


    /**
     *
     *
     * @param session {AxiosInstance}
     * @param manufacturerId
     * @param detailNumber
     * @param attempt
     * @param pBar
     * @return {Promise<void>}
     */
    async getDetailInfoByManufacturer(session, manufacturerId, detailNumber, attempt, pBar) {
        const originalsUrl = `https://webapi.autodoc.ru/api/spareparts/${manufacturerId}/${detailNumber}/2?framesId=undefined&attempt=${attempt}&isrecross=false`;
        const analogsUrl = `https://webapi.autodoc.ru/api/spareparts/analogs/${manufacturerId}/${detailNumber}/2`;

        session.defaults.headers.common['hash_'] = await this.getHash(manufacturerId, detailNumber);
        session.defaults.headers.common['dnt'] = '1';
        session.defaults.headers.common['source_'] = 'Site2';

        const originalsRequest = session.get(originalsUrl);
        const analogsRequest = session.get(analogsUrl);

        const responses = await Promise.all([originalsRequest, analogsRequest]);

        const originalsResponse = responses[0];
        const analogsResponse = responses[1];

        // console.log(originalsResponse.data);
        pBar.increment();

    }


    async getHash(manufacturerId, detailNumber) {
        const url = `https://webapi.autodoc.ru/api/spareparts/hash/${manufacturerId}/${detailNumber}`;
        const response = await this.functions.tryPost(url, {});
        return response.data;
    }


    async getManufacturerInfo(detailNumber, session, pBar) {
        const url = `https://webapi.autodoc.ru/api/manufacturers/${encodeURIComponent(detailNumber)}?showAll=false`;
        try {
            const response = await session.get(url);
            return response.data;
        } catch (e) {
            return false;
        }
    }


    async logIn(challengeGuid, tokenData, attempt, account) {
        const axiosInstance = this.functions.axios.create();
        const url = 'https://webapi.autodoc.ru/api/account/login';
        let response;
        try {
            response = await axiosInstance.post(url, {
                'attempt': attempt,
                'challengeGuid': challengeGuid,
                'gRecaptchaResponse': '',
                'login': account['LOGIN'],
                'password': account['PASSWORD'],
                'rememberMe': 'true'
            }, {
                headers: {
                    'authorization': tokenData['token_type'] + ' ' + tokenData['access_token'],
                },
                timeout: 3000
            });
        } catch (e) {
            // console.log(e);
            return false;
        }
        return axiosInstance;
    }

    // TODO: Остановился тут, перестала проходить авторизация, возможно забанили
    async getAuthToken(account) {
        const url = 'https://auth.autodoc.ru/token';
        let response;
        try {
            response = await this.functions.axios.post(url, {
                username: account['LOGIN'],
                password: account['PASSWORD'],
                grant_type: 'password',
            }, {
                headers: {
                    authorization: 'Bearer',
                    'content-type': 'application/x-www-form-urlencoded',
                    accept: 'application/json',
                    origin: 'https://www.autodoc.ru',
                    referer: 'https://www.autodoc.ru/',
                    'user-agent': this.functions.getUserAgent()
                },
            });
        } catch (e) {
            console.log(e);
            return false;
        }

        return response.data;
    }


    async getChallengeGuid() {
        const url = 'https://webapi.autodoc.ru/api/captha?resource=Auth';
        const response = await this.functions.tryGet(url);

        if (response) {
            const challengeGuid = response.data['challengeGuid'];
            if (challengeGuid) {
                return challengeGuid;
            }
        }
        return false;
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


    async makeGetRequest(url, pBar, config = {}) {
        const response = await this.functions.tryGet(url, config);
        pBar.increment();
        return response;
    }
}

module.exports = new Autodoc();