const Autodoc = require('./../parsers/Autodoc');
const Car = require('./../models/Car');
const functions = require('./../modules/Functions');

const vin = 'WAUBH54B11N111054';
const car = new Car(vin);
const parser = new Autodoc(car);


test('Первый запрос автодока', async () => {
    const url = 'https://catalogoriginal.autodoc.ru/api/catalogs/original/cars/WAUBH54B11N111054/modifications?clientId=449';
    const response = await functions.tryGet(url);
    expect(response).not.toBe(false);
    expect(response.status).toBe(200);
    expect(response.data).not.toBe(undefined);
});


test('Тест получения списка деталей по VIN номеру',async () => {
    const car = await parser.getCarCommonInfo();
    expect(car).not.toBe(undefined);
    expect(car).toBeInstanceOf(Car);
    expect(car.id).not.toBe(undefined);
    expect(car.ssd).not.toBe(undefined);
    expect(car.catalog).not.toBe(undefined);

    car.categories = await parser.getRawCategoryList(car);
    expect(car.categories.length).toBeGreaterThan(0);

    car.assemblyParts = await parser.getAssemblyParts(car);
    expect(car.assemblyParts.length).toBeGreaterThan(0);

    car.details = await parser.getDetails(car);
    expect(car.details.length).toBeGreaterThan(0);

}, 60000);