import { defaultConfig } from '../model/config';
import { getConfig, getIngesterMaxChunkAge } from '../api/routes';
import { getHTTPErrorDetails } from './errors';
import { parseDuration } from './duration';

export let config = defaultConfig;

export const loadConfig = async () => {
  let error = null;
  try {
    config = await getConfig();
  } catch (err) {
    error = getHTTPErrorDetails(err);
    console.log(error);
  }
  return { config, error };
};

export const loadMaxChunkAge = async () => {
  let duration = NaN;
  let error = null;
  try {
    const maxChunkAgeStr = await getIngesterMaxChunkAge();
    duration = parseDuration(maxChunkAgeStr);
  } catch (err) {
    error = getHTTPErrorDetails(err);
    console.log(error);
  }
  return { duration, error };
};
