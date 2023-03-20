class Autodoc
{
    Car = require('./../models/Car');
    Detail = require('./../models/Detail');
    // Устанавливаются вместе с инициализацией
    accounts;
    tokensDir = './tokens';


    constructor(car) {
        this.car = car;
        this.settings = require('./../modules/Settings');
        this.functions = require('./../modules/Functions');
        this.logger = require('./../modules/Logger');
    }


    async getDetailOffers(details, pBar) {
        const inputDirname = this.settings.INPUT.DIRNAME;
        const accountsFilename = this.settings.INPUT.ACCOUNTS;
        const accountsFilePath = `${inputDirname}/${accountsFilename}`.replaceAll('//', '/');
        this.accounts = await this.getAccounts(accountsFilePath);

        let responses = [];
        const detailItemsObj = {};
        let cycles = 1;

        if(this.settings.SETTINGS.REPEAT_DETAIL_CYCLES > 1) {
            cycles = this.settings.SETTINGS.REPEAT_DETAIL_CYCLES;
        }

        pBar.update(0);
        pBar.setTotal(details.length);

        let tokenData;
        while (this.accounts.length > 0 && !tokenData) {
            const account = this.getUniqueAccount();
            if(!account) {
                pBar.stop();
                break;
            }

            // TODO: Разобраться как использовать refresh_token
            // const authData = await this.getRefreshToken(account['LOGIN']);
            tokenData = await this.getAuthToken(account);

            if(!tokenData) {
                await this.logger.log(`Account ${account['LOGIN']} has been banned`);
            }

            if(!tokenData && this.accounts.length === 1) {
                await this.logger.error(`Не осталось рабочих аккаунтов`);
                break;
            }
        }

        if(!tokenData) {
            return;
        }

        const requestHeaders = {
            'authorization': tokenData['token_type'] + ' ' + tokenData['access_token'],
            'source_': 'Site2',
            'origin': 'https://www.autodoc.ru',
            'referer': 'https://www.autodoc.ru/',
        };

        for(let cycle = 0; cycle < cycles; cycle++)
        {
            const requests = [];

            for(const detail of details)
            {
                requests.push(this.parseDetail(detail, requestHeaders, pBar));

                detailItemsObj[detail] = {
                    'DETAIL_NUMBER': detail['DETAIL_NUMBER'],
                    'DETAIL_NAME': detail['DETAIL_NAME'],
                    'DETAIL_OFFERS': []
                };
                if(
                    this.settings.DEBUG.LIMIT === 'Y'
                    && parseInt(this.settings.DEBUG.LIMIT_COUNT) < requests.length
                ) {
                    break;
                }
            }
            pBar.update(0);
            const results = await Promise.all(requests);
            responses = responses.concat(results);
        }

        for(const response of responses) {
            if(!response) continue;
            for(const parsedDetail of response) {
                const originalDetailNumber = parsedDetail['ORIGINAL_DETAIL_NUMBER'];
                const originalDetailName = parsedDetail['ORIGINAL_DETAIL_NAME'];

                if(!(originalDetailNumber in detailItemsObj)) {
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
        const originalDetailNumber = detail['DETAIL_NUMBER'];
        const originalDetailName = detail['DETAIL_NAME'];
        const clearDetailNumber = originalDetailNumber.replaceAll('-', '').replaceAll(' ', '');

        const manufacturerList = await this.getManufacturerInfo(clearDetailNumber);

        if(!manufacturerList || manufacturerList.length === 0) {
            pBar.increment();
            return false;
        }

        const detailsInfo = [];
        for(const manufacturer of manufacturerList) {
            const manufacturerId = manufacturer['id'];
            const manufacturerName = manufacturer['manufacturerName'];
            const detailNumber = manufacturer['artNumber'] ?? originalDetailNumber;
            const detailName = manufacturer['partName'] ?? originalDetailName;

            const details = await this.getDetailInfoByManufacturer(manufacturerId, detailNumber, requestHeaders);

            const originals = details['originals'];
            const analogs = details['analogs'];

            if(originals.length === 0 && analogs.length === 0) continue;

            if(Array.isArray(originals))
            {
                for(const offer of originals)
                {
                    const deliveryTime = offer['deliveryDays'];

                    if(parseInt(deliveryTime) > parseInt(this.settings.SETTINGS.DELIVERY_LIMIT)) {
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

            if(Array.isArray(analogs)) {
                for(const offer of analogs) {
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
        if(detailsInfo.length !== 0) {
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


    async saveRefreshToken(login, refreshToken, expires) {
        const data = {
            'login': login,
            'refreshToken': refreshToken,
            'now': new Date().valueOf(),
            'expires': new Date().valueOf() + expires
        };

        await this.functions.writeJson(`./${this.tokensDir}/${login}.json`, JSON.stringify(data));
    }


    getRefreshToken(login) {
        try {
            const data = this.functions.readJson(`./${this.tokensDir}/${login}.json`);
            return data;
        } catch (e) {
            this.logger.error(e, true);
            return;
        }
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
            const config = {
                headers: {
                    authorization: 'Bearer',
                    'content-type': 'application/x-www-form-urlencoded',
                    accept: 'application/json',
                    origin: 'https://www.autodoc.ru',
                    referer: 'https://www.autodoc.ru/',
                    'user-agent': this.functions.getUserAgent()
                }
            };

            const data =  {
                username: account['LOGIN'],
                password: account['PASSWORD'],
                grant_type: 'password',
            };

            response = await this.functions.axios.post(url, data, config);
            await this.saveRefreshToken(account['LOGIN'], response.data['refresh_token'], response.data['expires_in']);

        } catch (e) {
            await this.logger.log(e);
            return false;
        }

        return response.data;
    }


    async getChallengeGuid() {
        const url = 'https://webapi.autodoc.ru/api/captha?resource=Auth';
        const response = await this.functions.tryGet(url);

        if(response) {
            const challengeGuid = response.data['challengeGuid'];
            if(challengeGuid) {
                return challengeGuid;
            }
        }
        return false;
    }


    /**
     *  Ищет детали по VIN номеру
     *
     * @returns {Car} объект Car с информацией о деталях
     */
    async parseVin() {
        const car = await this.getCarCommonInfo();
        if(!car) {
            return this.car;
        }

        car.categories = await this.getRawCategoryList(car);
        if(!car.categories || car.categories.length === 0) {
            return car;
        }

        car.assemblyParts = await this.getAssemblyParts(car.categories);
        if(!car.assemblyParts || car.assemblyParts.length === 0) {
            return car;
        }

        car.details = await this.getDetails(car);
        this.car = car;
        return car;
    }


    getUniqueAccount() {
        const randomIndex = Math.floor(Math.random() * this.accounts.length);
        const account = this.accounts[randomIndex];
        if(this.accounts.length > 0)
        {
            if(this.accounts.length === 1)
            {
                return this.accounts[0];
            }
            this.accounts.splice(randomIndex, 1);
        } else {
            return false;
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
        return this.functions.readXLSX(filepath);
    }


    async getAssemblyParts(car) {
        const categoryRequests = [];

        for(const category of car.categories) {
            const categoryId = category['categoryId'];
            const categorySsd = category['ssd'];
            const sparePartUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${car.catalog}/cars/${car.id}/categories/${categoryId}/units?ssd=${categorySsd}`;
            const categoryRequest = this.functions.tryGet(sparePartUrl);
            categoryRequests.push(categoryRequest);
        }

        const categoryResponses = await Promise.all(categoryRequests);

        const items = [];
        for(const response of categoryResponses) {
            if(!response) continue;
            const sparePartItems = response.data['items'];
            if(!sparePartItems) continue;

            for(const sparePart of sparePartItems) {
                items.push(sparePart);
            }
        }
        
        return items;
    }


    async getDetails(car) {
        const sparePartDetailInfoRequests = [];
        for(const assemblyPart of car.assemblyParts) {
            const sparePartDetailInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${car.catalog}/cars/${car.id}/units/${assemblyPart['unitId']}/spareparts?ssd=${assemblyPart['ssd']}`;
            const sparePartData = {'Ssd': assemblyPart.ssd};

            const sparePartDetailInfoRequest = this.functions.tryPost(sparePartDetailInfoUrl, sparePartData);
            sparePartDetailInfoRequests.push(sparePartDetailInfoRequest);
        }

        const sparePartDetailInfoResponses = await Promise.all(sparePartDetailInfoRequests);

        const details = [];
        for(const response of sparePartDetailInfoResponses) {
            if(!response || !response.data || !response.data['items'] || response.data['items'].length === 0) {
                continue;
            }

            for(const part of response.data['items']) {
                // TODO: Походу приходит говно с какими-то символами, которые крашат excel и не отображаются в ячейках
                const detail = new this.Detail(part['name'].trim(), car.vin);
                detail.number = part['partNumber'].replace(/[\s\-_]/gmi, '');
                if(!detail.number || detail.number === '') {
                    continue;
                }

                details.push(detail);
            }
        }

        return details;
    }


    async getRawCategoryList(car) {
        const categoriesUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/brands/${car.catalog}/cars/${car.id}/categories?ssd=${car.ssd}`;
        const categoriesResponse = await this.functions.tryGet(categoriesUrl);

        if(!categoriesResponse) {
            return false;
        }

        let rawCategories = categoriesResponse.data;

        if('items' in rawCategories) {
            rawCategories = rawCategories['items'];
        }

        if(!rawCategories || rawCategories.length === 0) {
            return false;
        }

        return getSubcategories(rawCategories);

        /**
         * Рекурсивно вытаскивает все подкатегории в общий массив
         *
         * @param categories    Массив с объектами категорий, прилетающих с autodoc.ru
         * @returns             Массив с категориями
         */
        function getSubcategories(categories) {
            let items = [];

            for(const category of categories) {
                if(category['children'].length !== 0) {
                    items = items.concat(getSubcategories(category['children']))
                } else {
                    items.push(category);
                }
            }

            return items;
        }
    }


    async getCarCommonInfo() {
        const vin = this.car.vin;
        const clientId = Math.floor(Math.random() * 500);
        const carPrimaryInfoUrl = `https://catalogoriginal.autodoc.ru/api/catalogs/original/cars/${vin}/modifications?clientId=${clientId}`;
        const response = await this.functions.tryGet(carPrimaryInfoUrl);
        if(!response || response.status !== 200) {
            return false;
        }

        const vinData = response.data;
        const primaryData = vinData['commonAttributes'];
        const modifications = vinData['specificAttributes'];

        if(!primaryData) {
            await this.logger.error(`No primary data at ${vin}`, true);
            return false;
        }

        // TODO: Тут можно собирать инфу по разным модификациям автомобиля (пока что беру только первую)
        if(Array.isArray(modifications) && modifications.length > 0) {
            for(const item of modifications[0]['attributes']) {
                primaryData.push(item);
            }
        }

        const carInfo = {};
        for(const property of primaryData) {
            carInfo[property['key']] = property['value'];
        }

        const car = new this.Car(vin);
        car.id = carInfo['CarID'];
        car.ssd = carInfo['Ssd'];
        car.catalog = carInfo['Catalog'];
        car.model = carInfo['Model']; // Может быть пустым

        return car;
    }


    setProgressBar(pBar) {
        this.pBar = pBar;
    }
}

module.exports = Autodoc;