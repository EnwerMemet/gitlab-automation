import http from "k6/http";
import { sleep } from "k6";

export function waitForPipelineInitialization(baseUrl, headers, projectId, mrIid, maxWaitSec = 60) {
  let pipelineId = null;
  let retries = 0;
  const pollIntervalSec = 5;
  const maxRetries = Math.ceil(maxWaitSec / pollIntervalSec);

  console.log(`[INFO] Waiting for pipeline initialization on MR #${mrIid}...`);

  while (!pipelineId && retries < maxRetries) {
    const mrRes = http.get(`${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}`, { headers });
    if (mrRes.status === 200) {
      pipelineId = mrRes.json("head_pipeline.id");
    }
    if (!pipelineId) {
      sleep(pollIntervalSec);
      retries++;
    }
  }

  return pipelineId;
}

export function waitForPipelineCompletion(baseUrl, headers, projectId, pipelineId, maxWaitSec = 180) {
  let retries = 0;
  const pollIntervalSec = 5;
  const maxRetries = Math.ceil(maxWaitSec / pollIntervalSec);

  console.log(`[INFO] Waiting for Pipeline #${pipelineId} to complete...`);

  while (retries < maxRetries) {
    const res = http.get(
      `${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipelineId}`,
      { headers }
    );

    if (res.status === 200) {
      const status = res.json("status");
      console.log(`[POLL ${retries + 1}/${maxRetries}] Pipeline status: ${status}`);

      if (status === "success") {
        return true;
      }

      if (["failed", "canceled", "skipped"].includes(status)) {
        console.error(`[FAIL] Pipeline terminated with status: ${status}`);
        return false;
      }
    }

    sleep(pollIntervalSec);
    retries++;
  }

  console.error(`[FAIL] Pipeline #${pipelineId} timed out before finishing.`);
  return false;
}
