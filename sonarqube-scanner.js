
const scanner = require('sonarqube-scanner'); scanner(
    {
        serverUrl: "http://localhost:9000",
        login: "admin",
        password: "terminator",
        options: {
            "sonar.sources": "./lib"
        },
    },
    () => process.exit()
);