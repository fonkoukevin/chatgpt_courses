// Keep the separate, inert bootstrap candidate covered by the existing CI group.
// Importing its mocked policy tests does not execute its CLI or a Docker command.
import '../../infra/registry-bootstrap/tests/registry-bootstrap.test.mjs';
