# Recomp.fyi research and LoG Hub decisions

Inspected 2026-11-14 before changing the submission architecture. Sources were read directly; the public submission repository's tree was observed at `95aee89b38f7ff2df31de476fad751b7ef8722d6`. Its processing engine is not present in that tree. No attempt was made to access a private engine, submit an issue or copy board data.

| Primary source inspected | Finding used here |
|---|---|
| [Submission process](https://recomp.fyi/add) | Repository metadata and guided forms converge on a bot-managed listing; the repository's own file outranks third-party text. |
| [Manifest specification](https://recomp.fyi/spec) and [schema](https://recomp.fyi/schema/v1.json) | Small root/default-branch JSON separates editorial metadata from host-generated release information. The spec is versioned. |
| [Manifest Issue Form](https://github.com/neurocontrarian/recomp-board/blob/95aee89b38f7ff2df31de476fad751b7ef8722d6/.github/ISSUE_TEMPLATE/1-manifest.yml) | A single repository URL is enough to register a repository-owned manifest. The person pointing to it does not need to be its author. |
| [Guided Issue Form](https://github.com/neurocontrarian/recomp-board/blob/95aee89b38f7ff2df31de476fad751b7ef8722d6/.github/ISSUE_TEMPLATE/2-add-project.yml) | Individual inputs/dropdowns separate project facts from owner-controlled statements; no JSON editing is required. |
| [Public relay workflow](https://github.com/neurocontrarian/recomp-board/blob/95aee89b38f7ff2df31de476fad751b7ef8722d6/.github/workflows/relay.yml) | The public repository forwards an issue number to another repository's engine. It is a submission frontend, not the implementation of ingestion or claims. |
| [Contributing guide](https://github.com/neurocontrarian/recomp-board/blob/95aee89b38f7ff2df31de476fad751b7ef8722d6/CONTRIBUTING.md) | Third-party additions are distinguished from claimed projects, and manifests are refreshed periodically. |

Only the behavior described above is attributed to these sources; the LoG Hub implementation is original. This is architectural inspiration, not a copied schema or board dataset. Recomp.board credits its own specification/schema under CC BY 4.0; this project does not reproduce either document.

LoG Hub deliberately differs: GitHub-only distribution remains mandatory; new/untrusted projects require a first review; team authority is distinct from repository control; transfers and sensitive attribution changes are held; manifest deletion does not abandon a claim to outsiders. Trust and removal decisions are explicit protected policy. Publishing uses GitHub Actions artifacts instead of a second engine repository, dispatch token or daily write/merge cycle.

GitHub API and workflow behavior was checked against [repository contents](https://docs.github.com/en/rest/repos/contents), [Actions artifacts](https://docs.github.com/en/rest/actions/artifacts), [release metadata](https://docs.github.com/en/rest/releases/releases), and [secure workflow guidance](https://docs.github.com/en/actions/reference/security/secure-use). GitHub remains authoritative for host identity and release asset facts. Artifact provenance and current policy, rather than an untrusted PR artifact or issue label, authorize publication.
