import { readFileSync } from "fs";
import { join } from "path";
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs, mergeResolvers } from "@graphql-tools/merge";
import { healthResolvers } from "../resolvers/health.resolver.ts";
import { authResolvers } from "../resolvers/auth.resolver.ts";

const schemaPath = join(process.cwd(), "src/graphql/schema");

export function buildGraphQL() {
    const typeDefsArray = loadFilesSync(schemaPath, {
        extensions: ["gql", "graphql"],
        recursive: true,
        requireMethod: (path: string) => readFileSync(path, "utf-8"),
    });

    const typeDefs = mergeTypeDefs(typeDefsArray);
    const resolvers = mergeResolvers([
        healthResolvers,
        authResolvers,
    ]);

    return { typeDefs, resolvers };
}
