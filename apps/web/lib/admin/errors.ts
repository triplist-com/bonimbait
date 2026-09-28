/** A user-facing (Hebrew) validation error thrown inside an admin action. */
export class ActionError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}
