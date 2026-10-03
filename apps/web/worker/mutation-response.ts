/**
 * Internal route signal for the shared post-commit invalidation boundary.
 * Application command projections are inspected before JSON serialization;
 * HTTP status and response-body reparsing are deliberately not authorities.
 */
const mutationOutcomes = new WeakMap<Response, "committed" | "not_committed">();

export function mutationResponse(result: unknown): Response {
  const response = Response.json(result);
  const rejected = typeof result === "object" && result !== null
    && Object.prototype.hasOwnProperty.call(result, "code");
  mutationOutcomes.set(response, rejected ? "not_committed" : "committed");
  return response;
}

export function hasCommittedMutation(response: Response): boolean {
  return mutationOutcomes.get(response) === "committed";
}
