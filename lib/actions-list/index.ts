import ec2Actions from './ec2-actions.json';
import s3Actions from './s3-actions.json';

export function getActions(service: string) {
    let allActions: any[];
    switch (service) {
        case 'ec2':
            allActions = ec2Actions;
            break;
        case 's3':
            allActions = s3Actions;
            break;
        default:
            return null;
    }

    return {
        actions: allActions,
        writeActions: allActions.filter(action => action.access.toLowerCase() === 'write'),
        readActions: allActions.filter(action => action.access.toLowerCase() === 'read'),
        listActions: allActions.filter(action => action.access.toLowerCase() === 'list')
    }
}