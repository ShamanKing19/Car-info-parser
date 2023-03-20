class Detail
{
    constructor(name = '', vin = '') {
        this.name = name;
        this.vin = vin;
        this.number = '';
        this.analogs = [];
        this.offers = [];
    }

    toXlsx() {
        return {
            'Номер детали': this.number,
            'Название детали': this.name
        };
    }
}

module.exports = Detail;