# Oracle Integrations

Point ContextGraph at your GraphQL endpoint. Run syncSchema. The agent discovers everything else.

## Payload CMS
1. Deploy your Payload GraphQL endpoint.
2. Add the URL to contextgraph.config.ts.
3. Run syncSchema.

## Hasura
1. Copy the Hasura GraphQL endpoint URL.
2. Add it to contextgraph.config.ts.
3. Run syncSchema.

## Apollo Server
1. Expose the Apollo GraphQL endpoint.
2. Add the URL to contextgraph.config.ts.
3. Run syncSchema.

## Custom GraphQL APIs
1. Ensure introspection is enabled.
2. Add the endpoint URL to contextgraph.config.ts.
3. Run syncSchema.
