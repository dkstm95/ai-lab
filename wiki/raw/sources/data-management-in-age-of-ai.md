# Data Management in the Age of AI Source Note

Source URL: https://williaminmon.substack.com/p/data-management-in-the-age-of-ai
Title: Data Management in the Age of AI
Author: William H. Inmon
Contributor: Jamie Knowles
Published: 2026-07-05
Retrieved: 2026-07-27

## Ingest Focus

This is a compact paraphrased note. It preserves the article's distinction
between structured and textual data management and its proposal for semantic
governance around enterprise AI.

## Structured Notes

- The article traces data management from application-local schemas through
  database administration, data integrity problems, data warehouses, logical
  data models, and the modern chief data role.
- It argues that adding systems does not resolve conflicting meanings or
  values. Data integrity at enterprise scale requires an architectural and
  semantic response.
- Structured data is managed through schemas and classical data models.
  Enterprise text requires different tools, especially ontologies and
  taxonomies; applying only relational modeling practices to text is treated as
  a category error.
- For a corporate LLM, the data management role includes vetting source text,
  excluding irrelevant material, selecting business-relevant content, and
  maintaining the ontology or taxonomy as the business changes.
- The proposed enterprise logical data model connects structured concepts with
  the ontology or taxonomy used for text.
- Physical centralization becomes impractical when data lives across many
  systems. The article therefore reframes centralization as a shared semantic
  understanding rather than a single physical store.
- Data managers control generative AI indirectly by governing the information
  and meanings made available to it, rather than directly editing every model
  behavior.

## Source Limits

Several quantitative and causal assertions, including the prevalence of
textual enterprise data and the effect of excluding material before LLM use,
are presented without enough evidence in the article to treat them as general
laws. Modern retrieval, access control, provenance, privacy, evaluation, and
prompt-injection concerns need more detail than the text-selection metaphor
provides. The author also promotes a related commercial data-preparation
company at the end of the article.
