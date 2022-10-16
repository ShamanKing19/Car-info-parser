class App {
    Parser = require("./modules/parser");
    Logger = require("./modules/logger");
    Settings = require("./modules/settings");


    constructor() {
        const settings = new this.Settings().get();
        const logger = new this.Logger(settings);
        this.parser = new this.Parser(settings);
    }

}



app = new App();

(async () => {
    app.parser.run();
})();