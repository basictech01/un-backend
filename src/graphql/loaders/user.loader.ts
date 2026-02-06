import DataLoader from 'dataloader';
import { findByIds } from '../../repositories/user.repository.ts';
import { User } from '../../models/user.model.ts';

export function createUserLoader() {
    return new DataLoader<number, User | null>(async (ids) => {
        const users = await findByIds(ids as number[]);
        const userMap = new Map(users.map((u) => [u.id, u]));
        return ids.map((id) => userMap.get(id) || null);
    });
}

export function createLoaders() {
    return {
        userLoader: createUserLoader(),
    };
}

export type Loaders = ReturnType<typeof createLoaders>;
