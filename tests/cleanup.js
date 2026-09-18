/* global __ENV */
/*
@description: Unified cleanup utility to delete matching subgroups and projects in sequence.
*/

import http from "k6/http";
import { fail } from "k6";

export let options = {
  iterations: 1,
  vus: 1,
};

export default function () {
  let token = __ENV.ACCESS_TOKEN;
  let parentGroupId = __ENV.PARENT_GROUP_ID || "142584572";
  let baseUrl = (__ENV.ENVIRONMENT_URL || "https://gitlab.com").replace(/\/$/, "");
  
  let subgroupPrefix = __ENV.SUBGROUP_PREFIX || "subgroup-";
  let projectPrefix = __ENV.PROJECT_PREFIX || "project-";

  if (!token) {
    fail("CRITICAL ERROR: ACCESS_TOKEN environment variable is required.");
  }

  let headers = {
    "Accept": "application/json",
    "PRIVATE-TOKEN": token,
  };

  // Step 1: Clean Subgroups
  console.log(`\n=== STEP 1: Cleaning Subgroups matching '${subgroupPrefix}' ===`);
  cleanupSubgroups(baseUrl, parentGroupId, subgroupPrefix, headers);

  // Step 2: Clean Projects
  console.log(`\n=== STEP 2: Cleaning Projects matching '${projectPrefix}' ===`);
  cleanupProjects(baseUrl, parentGroupId, projectPrefix, headers);

  console.log("\n=== Cleanup Complete ===");
}

function cleanupSubgroups(baseUrl, parentGroupId, prefix, headers) {
  let fetchUrl = `${baseUrl}/api/v4/groups/${parentGroupId}/subgroups?per_page=100`;
  let res = http.get(fetchUrl, { headers });

  if (res.status !== 200) {
    console.error(`Failed to fetch subgroups [HTTP ${res.status}]: ${res.body}`);
    return;
  }

  let subgroups = JSON.parse(res.body);
  let targetSubgroups = subgroups.filter(
    (sg) => sg.name.startsWith(prefix) || sg.path.startsWith(prefix)
  );

  if (targetSubgroups.length === 0) {
    console.log(`No subgroups found matching prefix '${prefix}'.`);
    return;
  }

  console.log(`Found ${targetSubgroups.length} subgroup(s) to delete.`);
  targetSubgroups.forEach((subgroup) => {
    let deleteUrl = `${baseUrl}/api/v4/groups/${subgroup.id}`;
    let deleteRes = http.del(deleteUrl, null, { headers });

    if (deleteRes.status === 202 || deleteRes.status === 200) {
      console.log(`SUCCESS: Scheduled deletion for subgroup '${subgroup.path}' (ID: ${subgroup.id})`);
    } else {
      console.error(`FAILED: Could not delete subgroup '${subgroup.path}' [HTTP ${deleteRes.status}]: ${deleteRes.body}`);
    }
  });
}

function cleanupProjects(baseUrl, parentGroupId, prefix, headers) {
  let fetchUrl = `${baseUrl}/api/v4/groups/${parentGroupId}/projects?per_page=100`;
  let res = http.get(fetchUrl, { headers });

  if (res.status !== 200) {
    console.error(`Failed to fetch projects [HTTP ${res.status}]: ${res.body}`);
    return;
  }

  let projects = JSON.parse(res.body);
  let targetProjects = projects.filter(
    (p) => p.name.startsWith(prefix) || p.path.startsWith(prefix)
  );

  if (targetProjects.length === 0) {
    console.log(`No projects found matching prefix '${prefix}'.`);
    return;
  }

  console.log(`Found ${targetProjects.length} project(s) to delete.`);
  targetProjects.forEach((project) => {
    let deleteUrl = `${baseUrl}/api/v4/projects/${project.id}`;
    let deleteRes = http.del(deleteUrl, null, { headers });

    if (deleteRes.status === 202 || deleteRes.status === 200) {
      console.log(`SUCCESS: Scheduled deletion for project '${project.path}' (ID: ${project.id})`);
    } else {
      console.error(`FAILED: Could not delete project '${project.path}' [HTTP ${deleteRes.status}]: ${deleteRes.body}`);
    }
  });
}