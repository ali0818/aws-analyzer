"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActions = void 0;
const ec2_actions_json_1 = __importDefault(require("./ec2-actions.json"));
const s3_actions_json_1 = __importDefault(require("./s3-actions.json"));
function getActions(service) {
    let allActions;
    switch (service) {
        case 'ec2':
            allActions = ec2_actions_json_1.default;
            break;
        case 's3':
            allActions = s3_actions_json_1.default;
            break;
        default:
            return null;
    }
    return {
        actions: allActions,
        writeActions: allActions.filter(action => action.access.toLowerCase() === 'write'),
        readActions: allActions.filter(action => action.access.toLowerCase() === 'read'),
        listActions: allActions.filter(action => action.access.toLowerCase() === 'list')
    };
}
exports.getActions = getActions;
//# sourceMappingURL=index.js.map