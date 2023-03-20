class Car
{
    constructor(vin) {
        this.vin = vin;
        this.categories = [];
        this.assemblyParts = []; // Детали в сборе
        this.details = []; // Детали
    }


    /**
     * Возвращает список деталей
     *
     * @returns {[Detail]}
     */
    getDetailsForPrint() {
        const details = [];
        for(const detail of this.details) {
            details.push(detail.toXlsx());
        }
        return details;
    }


    /**
     * Добавляет деталь в массив
     *
     * @param detail {Detail}
     */
    appendDetail(detail) {
        this.details.push(detail);
    }
}

module.exports = Car;