import { notifyDepartmentOfNewOrder } from 'backend/notifications.web';

export function PendingRequests_afterInsert(item, context) {
    // This triggers the email logic immediately after a record is added
    notifyDepartmentOfNewOrder(item);
    return item;
}
