import { notifyDepartmentOfNewOrder } from 'backend/notifications.web';

// This hook triggers immediately after the guest confirms their checkout
export function PendingRequests_afterInsert(item, context) {
    notifyDepartmentOfNewOrder(item);
    return item;
}
