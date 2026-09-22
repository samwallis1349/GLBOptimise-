/**
 * Future service boundary for tracking processing jobs (e.g. once
 * processing can move server-side, or a history view is added).
 *
 * Documented placeholder only — do not implement authentication,
 * networking, or persistence here yet. All processing today happens
 * entirely client-side; there is no job to "submit" anywhere.
 */
export class JobService {
  /** @param {object} _jobInput */
  async submitJob(_jobInput) {
    throw new Error('JobService.submitJob() is not implemented — no server-side processing exists yet.');
  }

  /** @param {string} _jobId */
  async getJobStatus(_jobId) {
    throw new Error('JobService.getJobStatus() is not implemented yet.');
  }

  async listRecentJobs() {
    throw new Error('JobService.listRecentJobs() is not implemented yet.');
  }
}
