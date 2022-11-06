class Emex {
    settings;

    constructor() {
        this.functions = require('./functions');
        this.logger = require('./logger');
        this.requestPortion = 10;
    }

    /**
     * Ищет предложения по номерам деталей
     *
     * @param details   {Object[]}      Массив с деталями
     * @param pBar      {GenericBar}    Progress bar
     * @return          {Object}        Объект, где ключ - номер детали
     */
    async getDetailOffers(details, pBar) {
        pBar.setTotal(details.length);
        let requests = [];
        let responses = [];

        for (const detail of details) {
            const detailName = detail.PART_NAME;
            const detailNumber = detail.PART_NUMBER;
            requests.push(this.requestDetail(detailNumber, pBar));
            if (requests.length === this.requestPortion) {
                const results = await Promise.all(requests);
                responses = responses.concat(results);
                requests = [];
            }
            if (this.settings.DEBUG.LIMIT === 'Y' && responses.length >= this.settings.DEBUG.LIMIT_COUNT) { // DEBUG
                break;
            }
        }

        const results = await Promise.all(requests);
        responses = responses.concat(results);

        // pBar.update(0);
        // pBar.setTotal(responses.length); // Ломает

        const detailItems = {};
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

            detailItems[originalDetailNumber] = {
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

                        detailItems[originalDetailNumber]['DETAIL_OFFERS'].push(item);
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
                        detailItems[originalDetailNumber]['DETAIL_OFFERS'].push(item);
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
                        detailItems[originalDetailNumber]['DETAIL_OFFERS'].push(item);
                    }
                }
            }

            pBar.increment();
        }

        return detailItems;
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