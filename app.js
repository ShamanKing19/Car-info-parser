class App {

    constructor() {
        this.settings = require('./modules/Settings').get();
        this.logger = require('./modules/Logger');
        this.parser = require('./modules/Parser');
    }

}

// Эта конструкция не работает, прога не ждёт init() и поэтому в конце не закрывается
// TODO: Починить
(async () => {
    const app = new App();
    await app.parser.init();
})();