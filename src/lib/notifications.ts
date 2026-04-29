// Notification service — stubs for future email/push integration.
// When implemented, connect to an API endpoint (e.g. SendGrid, Resend, or internal backend).

export interface NewRequestPayload {
  requestId: string;
  requestName: string;
  createdByName: string;
  createdAt: string;
  adminEmails: string[];
}

export interface StatusChangePayload {
  projectId: string;
  projectName: string;
  previousStatus: string;
  nextStatus: string;
  changedByName: string;
  participantEmails: string[];
}

// Called when an engineer submits a new request.
// Should notify admins so they can review it promptly.
export function notifyNewRequest(_payload: NewRequestPayload): void {
  // TODO: POST to /api/notifications/new-request
}

// Called when an admin changes the status of a project.
// Should notify engineers and supervisors assigned to the project.
export function notifyStatusChange(_payload: StatusChangePayload): void {
  // TODO: POST to /api/notifications/status-change
}
