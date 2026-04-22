import type { Context } from '../base/context';
import type { CreateEnvOptions } from '../base/env';

export type SubgameMountPayload = {
    hostContext: Context;
    launchParams: CreateEnvOptions;
};
