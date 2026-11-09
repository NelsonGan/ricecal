export class CreativeUploadError extends Error {
  constructor(message, status = 500, receipt = {}) {
    super(message);
    this.status = status;
    this.receipt = receipt;
  }
}
