/* global __ENV */
import { group, sleep } from "k6";
import { Rate } from "k6/metrics";
import { logError } from "../../lib/gpt_k6_modules.js";
import { createGroup, deleteGroup } from "../lib/gpt_scenario_functions.js";

export let successRate = new Rate("successful_requests");

export let options = {
  iterations: 1,
  vus: 1,
  thresholds: {
    "successful_requests": ["rate==1.0"],
    "http_req_failed": ["rate==0"]
  }
};

export function setup() {
  console.log('\n--- [SETUP] Resolving Parent Group ---');
  let parentId = __ENV.PARENT_GROUP_ID || '142584572';

  let subGroupName = `subgroup-func`;
  console.log(`Target Parent Group ID: ${parentId} | New Subgroup Name: ${subGroupName}`);

  return { subGroupName, parentId };
}

export default function (data) {
  if (!data.parentId) {
    console.error('[EXECUTION ABORTED] Missing Parent Group ID.');
    successRate.add(false);
    return;
  }

  group("API Functional Test - Create Subgroup", function () {
    console.log('--- [EXECUTION] Testing POST /groups (Subgroup) ---');
    let res = createGroup(data.subGroupName, data.parentId);
    
    let isSuccess = /20(0|1)/.test(res.status);
    if (isSuccess) {
      let createdSubgroup = JSON.parse(res.body);
      console.log(`[PASS] Subgroup created successfully! (ID: ${createdSubgroup.id}, Status: ${res.status})`);
      successRate.add(true);
      
      // Return created ID so teardown knows what to delete
      return { createdSubgroupId: createdSubgroup.id };
    } else {
      console.error(`[FAIL] Subgroup creation failed (Status: ${res.status})`);
      successRate.add(false);
      logError(res);
    }
  });
}

export function teardown(data) {
  // k6 passes default function return value to teardown
  let subgroupId = data?.createdSubgroupId;
  if (subgroupId) {
    console.log('--- [TEARDOWN] Cleaning Up Created Subgroup ---');
    sleep(1); // Brief delay for API stability
    deleteGroup(subgroupId);
    console.log(`Deleted Subgroup ID: ${subgroupId}`);
  } else {
    console.log('--- [TEARDOWN] No subgroup created to clean up ---');
  }
}