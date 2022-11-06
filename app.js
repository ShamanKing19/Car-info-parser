class App {

    constructor() {
        this.settings = require('./modules/settings').get();
        this.logger = require('./modules/logger');
        this.parser = require('./modules/parser');
    }

}

// Эта конструкция не работает, прога не ждёт init() и поэтому в конце не закрывается
// TODO: Починить
(async () => {
    const app = new App();
    const settings = app.settings;
    await app.parser.init(settings);
})();