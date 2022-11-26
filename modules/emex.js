class Emex {
    settings;
    runningParsersCount = 0;
    defaultPortion = 10;

    constructor() {
        this.functions = require('./functions');
        this.logger = require('./logger');
    }

    /**
     * Ищет предложения по номерам деталей
     *
     * @param details   {Object[]}      Массив с деталями
     * @param pBar      {GenericBar}    Progress bar
     * @param vin       {string}        Vin номер
     * @return          {Object}        Объект, где ключ - номер детали
     */
    async getDetailOffers(details, pBar, vin) {
        pBar.setTotal(details.length);
        let requests = [];
        let responses = [];
        let cycles = 1;

        // Для работы циклов
        let detailsCount = 0;
        const foundDetails = [];

        if (this.settings.SETTINGS.REPEAT_DETAIL_CYCLES > 1) {
            cycles = this.settings.SETTINGS.REPEAT_DETAIL_CYCLES;
        }

        for (let cycle = 0; cycle < cycles; cycle++)
        {
            let portion = Math.floor(this.defaultPortion / this.runningParsersCount);
            portion = portion < 1 ? 1 : portion;

            let cycleResponses = [];

            for (const detail of details)
            {
                const detailNumber = detail.PART_NUMBER;

                if (foundDetails.includes(detailNumber.trim())) continue;

                requests.push(this.requestDetail(detailNumber, pBar));
                detailsCount++;
                if (requests.length >= portion) {
                    const results = await Promise.all(requests);
                    responses = responses.concat(results);
                    cycleResponses = cycleResponses.concat(results);
                    requests = [];
                    portion = Math.floor(this.defaultPortion / this.runningParsersCount);
                    portion = portion < 1 ? 1 : portion;
                }

                if (
                    this.settings.DEBUG.LIMIT === 'Y'
                    && detailsCount >= this.settings.DEBUG.LIMIT_COUNT
                ) {
                    break;
                }
            }

            const results = await Promise.all(requests);
            responses = responses.concat(results);
            cycleResponses = cycleResponses.concat(results);

            let foundDetailsCount = 0;
            for (const response of cycleResponses) {
                if (!response) continue;
                const data = response.data['searchResult'];
                if (!data) continue;
                const foundDetailNum = data['num']?.trim();
                const foundOriginalOffers = data['originals'];
                const foundAnalogsOffers = data['analogs'];
                const foundReplacementsOffers = data['replacements'];

                if (
                    !foundOriginalOffers
                    && !foundAnalogsOffers
                    && !foundReplacementsOffers
                ) {
                    continue;
                }

                if (
                    foundOriginalOffers.length === 0
                    && foundAnalogsOffers.length === 0
                    && foundReplacementsOffers.length === 0
                )  {
                    continue;
                }

                foundDetails.push(foundDetailNum);
                foundDetailsCount++;
            }

            const notFoundDetailsCount = pBar.getTotal() - foundDetailsCount;
            pBar.setTotal(notFoundDetailsCount);
            await this.logger.log(`Найдено ${foundDetailsCount} в ${cycle + 1}-м цикле по ${vin}`);

            detailsCount = 0;
            if (cycle + 1 !== cycles) {
                pBar.update(0);
            }
        }

        const detailItemsObj = {};
        for (const response of responses)
        {
            if (!response) continue;
            const data = response.data['searchResult'];
            if (!data) continue;

            const originalDetailNumber = data['num'];
            const originalDetailName = data['name'];

            const originals = data['originals'];
            const analogs = data['analogs'];
            const replacements = data['replacements'];

            detailItemsObj[originalDetailNumber] = {
                'DETAIL_NUMBER': originalDetailNumber,
                'DETAIL_NAME': originalDetailName,
                'DETAIL_OFFERS': []
            };


            // originals - массив с одним объектом (хз чё за прикол)
            if (Array.isArray(originals))
            {
                for (const original of originals)
                {
                    // Если он не найдёт деталь, то предложит похожие, можно делать доп запросы и собирать инфу ещё и по ним
                    const offers = original['offers'];
                    if (!Array.isArray(offers)) continue;
                    for (const offer of offers)
                    {
                        const item = {
                            'TYPE': 'original',
                            'ORIGINAL_DETAIL_NUMBER': originalDetailNumber,
                            'ORIGINAL_DETAIL_NAME': originalDetailName,
                            'DETAIL_NUMBER': offer['data']['detailNum'],
                            'DETAIL_NAME': offer['data']['detailName'],
                            'PRICE': offer['price']['value'],
                            'DELIVERY': offer['delivery']['value'],
                            'QUANTITY': offer['quantity'],
                            'MANUFACTURER': offer['data']['makeName'] ?? offer['data']['make'],
                        };

                        if (item['DELIVERY'] > this.settings.SETTINGS.DELIVERY_LIMIT) continue;

                        detailItemsObj[originalDetailNumber]['DETAIL_OFFERS'].push(item);
                    }
                }
            }

            if (Array.isArray(analogs))
            {
                for (const analog of analogs)
                {
                    const offers = analog['offers'];
                    if (!Array.isArray(offers)) continue;
                    for (const offer of offers)
                    {
                        const item = {
                            'TYPE': 'analog',
                            'ORIGINAL_DETAIL_NUMBER': originalDetailNumber,
                            'ORIGINAL_DETAIL_NAME': originalDetailName,
                            'DETAIL_NUMBER': offer['data']['detailNum'],
                            'DETAIL_NAME': offer['data']['name'],
                            'PRICE': offer['price'] ? offer['price']['value'] : '',
                            'DELIVERY': offer['delivery'] ? offer['price']['value'] : '',
                            'QUANTITY': offer['quantity'],
                            'MANUFACTURER': offer['data']['makeName'] ?? offer['data']['make'],
                        };

                        if (item['DELIVERY'] > this.settings.SETTINGS.DELIVERY_LIMIT) continue;
                        detailItemsObj[originalDetailNumber]['DETAIL_OFFERS'].push(item);
                    }
                }
            }

            if (Array.isArray(replacements))
            {
                for (const replacement of replacements)
                {
                    const offers = replacement['offers'];
                    if (!Array.isArray(offers)) continue;
                    for (const offer of offers)
                    {
                        const item = {
                            'TYPE': 'replacement',
                            'ORIGINAL_DETAIL_NUMBER': originalDetailNumber,
                            'ORIGINAL_DETAIL_NAME': originalDetailName,
                            'DETAIL_NUMBER': offer['data']['detailNum'],
                            'DETAIL_NAME': offer['data']['name'],
                            'PRICE': offer['price']['value'],
                            'DELIVERY': offer['delivery']['value'],
                            'QUANTITY': offer['quantity'],
                            'MANUFACTURER': offer['data']['makeName'] ?? offer['data']['make'],
                        };

                        if (item['DELIVERY'] > this.settings.SETTINGS.DELIVERY_LIMIT) continue;
                        detailItemsObj[originalDetailNumber]['DETAIL_OFFERS'].push(item);
                    }
                }
            }
        }

        this.runningParsersCount--;
        return detailItemsObj;
    }


    /**
     * Получает список предложений по запрошенной детали
     *
     * @param detailNumber {string}
     * @param pBar  {GenericBar}
     * @returns {Promise<AxiosResponse<*>|boolean>}
     */
    async requestDetail(detailNumber, pBar) {
        const locationIdList = [36746, 20847, 25313, 21081];
        const latitudeList = [54.7424, 54.7424, 54.6795, 54.6923, 20.6024, 54.7033];
        const longitudeList = [20.4835, 20.4838, 20.4938, 20.5102, 20.5197, 20.5114];

        let locationIndex = Math.floor(Math.random() * locationIdList.length);

        const locationId = encodeURIComponent(locationIdList[locationIndex]);
        const latitude = encodeURIComponent(latitudeList[locationIndex]);
        const longitude = encodeURIComponent(longitudeList[locationIndex]);

        const showAll = 'false'; // При true будет дохуища результатов

        const url = `https://emex.ru/api/search/search2?detailNum=${encodeURIComponent(detailNumber)}&isHeaderSearch=true&showAll=${showAll}&searchString=${encodeURIComponent(detailNumber)}&locationId=${locationId}&longitude=${longitude}&latitude=${latitude}`;
        const headers = {
            'Access-Control-Allow-Origin': 'https://emex.ru',
            'referer': `https://emex.ru/products/${detailNumber}/`,
            'host': 'emex.ru',
            'User-agent': this.functions.getUserAgent()
        };

        const response = await this.functions.tryGet(url, {headers: headers});
        pBar.increment();
        return response;
    }

}


module.exports = new Emex();