class Autodoc {
    // Устанавливаются вместе с инициализацией
    settings;
    accounts;

    constructor() {
        this.functions = require('./functions');
        this.logger = require('./logger');
    }


    async getDetailOffers(details, pBar) {
        const inputDirname = this.settings.INPUT.DIRNAME;
        const accountsFilename = this.settings.INPUT.ACCOUNTS;
        const accountsFilePath = `${inputDirname}/${accountsFilename}`.replaceAll('//', '/');
        this.accounts = await this.getAccounts(accountsFilePath);

        const detailItemsObj = {};

        pBar.update(0);
        pBar.setTotal(details.length);

        let tokenData;
        while (this.accounts.length > 0 && !tokenData) {
            const account = this.getUniqueAccount();
            tokenData = await this.getAuthToken(account);
            // if (!tokenData) {
            //     console.log('\nAccount', account, 'has been banned :(');
            // }
        }

        const requestHeaders = {
            'authorization': tokenData['token_type'] + ' ' + tokenData['access_token'],
            'source_': 'Site2',
            'origin': 'https://www.autodoc.ru',
            'referer': 'https://www.autodoc.ru/',
        };

        const requests = [];
        for (const detail of details) {
            requests.push(this.parseDetail(detail, requestHeaders, pBar));

            detailItemsObj[detail] = {
                'DETAIL_NUMBER': detail['PART_NUMBER'],
                'DETAIL_NAME': detail['PART_NAME'],
                'DETAIL_OFFERS': []
            };
            if (
                this.settings.DEBUG.LIMIT === 'Y'
                && parseInt(this.settings.DEBUG.LIMIT_COUNT) < requests.length
            ) {
                break;
            }
        }

        const responses = await Promise.all(requests);

        for (const response of responses) {
            if (!response) continue;
            for (const parsedDetail of response) {
                const originalDetailNumber = parsedDetail['ORIGINAL_DETAIL_NUMBER'];
                const originalDetailName = parsedDetail['ORIGINAL_DETAIL_NAME'];

                if (!(originalDetailNumber in detailItemsObj)) {
                    detailItemsObj[originalDetailNumber] = {
                        'DETAIL_NUMBER': originalDetailNumber,
                        'DETAIL_NAME': originalDetailName,
                        'DETAIL_OFFERS': [parsedDetail]
                    };
                } else {
                    detailItemsObj[originalDetailNumber]['DETAIL_OFFERS'].push(parsedDetail);
                }
            }
        }
        return detailItemsObj;
    }


    async parseDetail(detail, requestHeaders, pBar) {
        const originalDetailNumber = detail['PART_NUMBER'];
        const originalDetailName = detail['PART_NAME'];
        const clearDetailNumber = originalDetailNumber.replaceAll('-', '').replaceAll(' ', '');

        const manufacturerList = await this.getManufacturerInfo(clearDetailNumber);

        if (!manufacturerList || manufacturerList.length === 0) {
            pBar.increment();
            return false;
        }

        const detailsInfo = [];
        for (const manufacturer of manufacturerList) {
            const manufacturerId = manufacturer['id'];
            const manufacturerName = manufacturer['manufacturerName'];
            const detailNumber = manufacturer['artNumber'] ?? originalDetailNumber;
            const detailName = manufacturer['partName'] ?? originalDetailName;

            const details = await this.getDetailInfoByManufacturer(manufacturerId, detailNumber, requestHeaders);

            const originals = details['originals'];
            const analogs = details['analogs'];

            if (originals.length === 0 && analogs.length === 0) continue;

            if (Array.isArray(originals))
            {
                for (const offer of originals)
                {
                    const deliveryTime = offer['deliveryDays'];

                    if (parseInt(deliveryTime) > parseInt(this.settings.SETTINGS.DELIVERY_LIMIT)) {
                        continue;
                    }

                    const detailInfo = {
                        'TYPE': 'original',
                        'ORIGINAL_DETAIL_NUMBER': originalDetailNumber,
                        'ORIGINAL_DETAIL_NAME': originalDetailName,
                        'DETAIL_NUMBER': detailNumber,
                        'DETAIL_NAME': detailName,
                        'PRICE': offer['price'],
                        'DELIVERY': deliveryTime,
                        'MINIMAL_DELIVERY': offer['minimalDeliveryDays'], // Можно убрать
                        'QUANTITY': offer['quantity'],
                        'MANUFACTURER': manufacturerName,
                    };
                    detailsInfo.push(detailInfo);
                }
            } else {
                console.log('not array', originals);
            }

            if (Array.isArray(analogs)) {
                for (const offer of analogs) {
                    const detailInfo = {
                        'TYPE': 'original',
                        'ORIGINAL_DETAIL_NUMBER': originalDetailNumber,
                        'ORIGINAL_DETAIL_NAME': originalDetailName,
                        'DETAIL_NUMBER': detailNumber,
                        'DETAIL_NAME': detailName,
                        'PRICE': offer['price'],
                        'DELIVERY': offer['deliveryDays'],
                        'MINIMAL_DELIVERY': offer['minimalDeliveryDays'], // Можно убрать
                        'QUANTITY': offer['quantity'],
                        'MANUFACTURER': manufacturerName,
                    };
                    detailsInfo.push(detailInfo);
                }
            } else {
                console.log('not array', analogs);
            }
        }

        pBar.increment();
        if (detailsInfo.length !== 0) {
            return detailsInfo;
        }
        return false;
    }


    /**
     * Получает информацию о предложениях по детали
     *
     * @param manufacturerId
     * @param detailNumber
     * @param requestHeaders
     * @return {Promise<{analogs, originals}>}
     */
    async getDetailInfoByManufacturer(manufacturerId, detailNumber, requestHeaders) {
        const originalsUrl = `https://webapi.autodoc.ru/api/spareparts/${manufacturerId}/${detailNumber}/2?isrecross=false`;
        // const analogsUrl = `https://webapi.autodoc.ru/api/spareparts/analogs/${manufacturerId}/${detailNumber}/2`;

        requestHeaders['hash_'] = await this.getHash(manufacturerId, detailNumber);

        const config = {
            headers: requestHeaders
        };

        // TODO: Заменить на tryGet и выяснить, почему с ним ничего не работает (пустые ответы)
        //  Скорее всего не устанавливается конфиг
        const originalsRequest = this.functions.axios.get(originalsUrl, config);
        // const analogsRequest = this.functions.axios.get(analogsUrl, config);

        let response;
        // TODO: Убрать отсюда try catch
        try {
            // responses = await Promise.all([originalsRequest, analogsRequest]);
            response = await originalsRequest;
        } catch (e) {
            return {
                'originals' : [],
                'analogs' : [],
            }
        }

        // const originalsResponse = responses[0];
        // const analogsResponse = responses[1];

        return {
            // 'originals': originalsResponse.data['inventoryItems'],
            // 'analogs': analogsResponse.data['inventoryItems']
            'originals': response.data['inventoryItems'],
            'analogs': []
        };

    }


    async getHash(manufacturerId, detailNumber) {
        const url = `https://webapi.autodoc.ru/api/spareparts/hash/${manufacturerId}/${detailNumber}`;
        const response = await this.functions.tryPost(url, {});
        return response.data;
    }


    async getManufacturerInfo(detailNumber) {
        const url = `https://webapi.autodoc.ru/api/manufacturers/${encodeURIComponent(detailNumber)}?showAll=false`;
        let response;
        try {
            response = await this.functions.axios.get(url);
        } catch (e) {
            return false;
        }
        return response.data;
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


    getUniqueAccount() {
        const randomIndex = Math.floor(Math.random() * this.accounts.length);
        const account = this.accounts[randomIndex];
        if (this.accounts.length > 1) {
            this.accounts.splice(randomIndex, 1);
        }
        return account;
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