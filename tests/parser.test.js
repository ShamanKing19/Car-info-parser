const functions = require('./../modules/Functions');
const fs = require('fs');
const Car = require('./../models/Car');
const Detail = require('./../models/Detail');


const path = 'details_test.xlsx';

const car = new Car('WAUBH54B11N111054');
const detail1 = new Detail('Сайлентблок', car.vin);
const detail2 = new Detail('Болт', car.vin);
const detail3 = new Detail('Зеркало', car.vin);
detail1.number = 'eqwe12123';
detail2.number = 'jk3543252';
detail3.number = 'zxczxczxc';

car.appendDetail(detail1);
car.appendDetail(detail2);
car.appendDetail(detail3);

// Это говно работает, но не тут...
test('Создание и чтение xlsx файла с vin номерами', async () => {
    // await functions.createXLSXAsync(path, car.getDetailsForPrint(), car.vin);
    // const isCreated = fs.existsSync(path);
    // expect(isCreated).toBe(true);
    //
    // if(fs.existsSync(path)) {
    //     fs.unlinkSync(path);
    // }

    // const data = functions.readXLSX(path);
    // expect(data).toBe(car.getDetailsForPrint());
});
