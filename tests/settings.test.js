// Тест настроек

test('Получение файла с настройками', () => {
    const settings = require('./../modules/Settings');
    const settingsObj = settings.get();
    expect(settingsObj.STARTUP).not.toBe(undefined);
    expect(settingsObj.INPUT).not.toBe(undefined);
    expect(settingsObj.OUTPUT).not.toBe(undefined);
    expect(settingsObj.SETTINGS).not.toBe(undefined);
    expect(settingsObj.PARSERS).not.toBe(undefined);
    expect(settingsObj.DEBUG).not.toBe(undefined);
});