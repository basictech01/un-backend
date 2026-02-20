import { TokenData } from '../graphql/context';

declare global {
    namespace Express {
        interface Request {
            user?: TokenData;
        }
    }
}
