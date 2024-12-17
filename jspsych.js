import autoBind from 'auto-bind';
import rw from 'random-words';
import seedrandom from 'seedrandom/lib/alea';

var version = "8.1.0";

class ExtensionManager {
  constructor(dependencies, extensionsConfiguration) {
    this.dependencies = dependencies;
    this.extensionsConfiguration = extensionsConfiguration;
    this.extensions = Object.fromEntries(
      extensionsConfiguration.map((extension) => [
        ExtensionManager.getExtensionNameByClass(extension.type),
        this.dependencies.instantiateExtension(extension.type)
      ])
    );
  }
  static getExtensionNameByClass(extensionClass) {
    return extensionClass["info"].name;
  }
  getExtensionInstanceByClass(extensionClass) {
    return this.extensions[ExtensionManager.getExtensionNameByClass(extensionClass)];
  }
  async initializeExtensions() {
    await Promise.all(
      this.extensionsConfiguration.map(({ type, params = {} }) => {
        this.getExtensionInstanceByClass(type).initialize(params);
        const extensionInfo = type["info"];
        if (!("version" in extensionInfo) && !("data" in extensionInfo)) {
          console.warn(
            extensionInfo["name"],
            "is missing the 'version' and 'data' fields. Please update extension as 'version' and 'data' will be required in v9. See https://www.jspsych.org/latest/developers/extension-development/ for more details."
          );
        } else if (!("version" in extensionInfo)) {
          console.warn(
            extensionInfo["name"],
            "is missing the 'version' field. Please update extension as 'version' will be required in v9. See https://www.jspsych.org/latest/developers/extension-development/ for more details."
          );
        } else if (!("data" in extensionInfo)) {
          console.warn(
            extensionInfo["name"],
            "is missing the 'data' field. Please update extension as 'data' will be required in v9. See https://www.jspsych.org/latest/developers/extension-development/ for more details."
          );
        }
      })
    );
  }
  onStart(trialExtensionsConfiguration = []) {
    for (const { type, params } of trialExtensionsConfiguration) {
      this.getExtensionInstanceByClass(type)?.on_start(params);
    }
  }
  onLoad(trialExtensionsConfiguration = []) {
    for (const { type, params } of trialExtensionsConfiguration) {
      this.getExtensionInstanceByClass(type)?.on_load(params);
    }
  }
  async onFinish(trialExtensionsConfiguration = []) {
    const results = await Promise.all(
      trialExtensionsConfiguration.map(
        ({ type, params }) => Promise.resolve(this.getExtensionInstanceByClass(type)?.on_finish(params))
      )
    );
    const extensionInfos = trialExtensionsConfiguration.length ? {
      extension_type: trialExtensionsConfiguration.map(({ type }) => type["info"].name),
      extension_version: trialExtensionsConfiguration.map(({ type }) => type["info"].version)
    } : {};
    results.unshift(extensionInfos);
    return Object.assign({}, ...results);
  }
}

function unique(arr) {
  return [...new Set(arr)];
}
function deepCopy(obj) {
  if (!obj) return obj;
  let out;
  if (Array.isArray(obj)) {
    out = [];
    for (const x of obj) {
      out.push(deepCopy(x));
    }
    return out;
  } else if (typeof obj === "object" && obj !== null) {
    out = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        out[key] = deepCopy(obj[key]);
      }
    }
    return out;
  } else {
    return obj;
  }
}
function deepMerge(obj1, obj2) {
  let merged = {};
  for (const key in obj1) {
    if (obj1.hasOwnProperty(key)) {
      if (typeof obj1[key] === "object" && obj2.hasOwnProperty(key)) {
        merged[key] = deepMerge(obj1[key], obj2[key]);
      } else {
        merged[key] = obj1[key];
      }
    }
  }
  for (const key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      if (!merged.hasOwnProperty(key)) {
        merged[key] = obj2[key];
      } else if (typeof obj2[key] === "object") {
        merged[key] = deepMerge(merged[key], obj2[key]);
      } else {
        merged[key] = obj2[key];
      }
    }
  }
  return merged;
}

var utils = /*#__PURE__*/Object.freeze({
  __proto__: null,
  deepCopy: deepCopy,
  deepMerge: deepMerge,
  unique: unique
});

class DataColumn {
  constructor(values = []) {
    this.values = values;
  }
  sum() {
    let s = 0;
    for (const v of this.values) {
      s += v;
    }
    return s;
  }
  mean() {
    let sum = 0;
    let count = 0;
    for (const value of this.values) {
      if (typeof value !== "undefined" && value !== null) {
        sum += value;
        count++;
      }
    }
    if (count === 0) {
      return void 0;
    }
    return sum / count;
  }
  median() {
    if (this.values.length === 0) {
      return void 0;
    }
    const numbers = this.values.slice(0).sort(function(a, b) {
      return a - b;
    });
    const middle = Math.floor(numbers.length / 2);
    const isEven = numbers.length % 2 === 0;
    return isEven ? (numbers[middle] + numbers[middle - 1]) / 2 : numbers[middle];
  }
  min() {
    return Math.min.apply(null, this.values);
  }
  max() {
    return Math.max.apply(null, this.values);
  }
  count() {
    return this.values.length;
  }
  variance() {
    const mean = this.mean();
    let sum_square_error = 0;
    for (const x of this.values) {
      sum_square_error += Math.pow(x - mean, 2);
    }
    const mse = sum_square_error / (this.values.length - 1);
    return mse;
  }
  sd() {
    const mse = this.variance();
    const rmse = Math.sqrt(mse);
    return rmse;
  }
  frequencies() {
    const unique = {};
    for (const x of this.values) {
      if (typeof unique[x] === "undefined") {
        unique[x] = 1;
      } else {
        unique[x]++;
      }
    }
    return unique;
  }
  all(eval_fn) {
    for (const x of this.values) {
      if (!eval_fn(x)) {
        return false;
      }
    }
    return true;
  }
  subset(eval_fn) {
    const out = [];
    for (const x of this.values) {
      if (eval_fn(x)) {
        out.push(x);
      }
    }
    return new DataColumn(out);
  }
}

function saveTextToFile(textstr, filename) {
  const blobToSave = new Blob([textstr], {
    type: "text/plain"
  });
  let blobURL = "";
  if (typeof window.webkitURL !== "undefined") {
    blobURL = window.webkitURL.createObjectURL(blobToSave);
  } else {
    blobURL = window.URL.createObjectURL(blobToSave);
  }
  const link = document.createElement("a");
  link.id = "jspsych-download-as-text-link";
  link.style.display = "none";
  link.download = filename;
  link.href = blobURL;
  link.click();
}
function JSON2CSV(objArray) {
  const array = typeof objArray != "object" ? JSON.parse(objArray) : objArray;
  let line = "";
  let result = "";
  const columns = [];
  for (const row of array) {
    for (const key in row) {
      let keyString = key + "";
      keyString = '"' + keyString.replace(/"/g, '""') + '",';
      if (!columns.includes(key)) {
        columns.push(key);
        line += keyString;
      }
    }
  }
  line = line.slice(0, -1);
  result += line + "\r\n";
  for (const row of array) {
    line = "";
    for (const col of columns) {
      let value = typeof row[col] === "undefined" ? "" : row[col];
      if (typeof value == "object") {
        value = JSON.stringify(value);
      }
      const valueString = value + "";
      line += '"' + valueString.replace(/"/g, '""') + '",';
    }
    line = line.slice(0, -1);
    result += line + "\r\n";
  }
  return result;
}
function getQueryString() {
  const a = window.location.search.substr(1).split("&");
  const b = {};
  for (let i = 0; i < a.length; ++i) {
    const p = a[i].split("=", 2);
    if (p.length == 1) b[p[0]] = "";
    else b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
  }
  return b;
}

class DataCollection {
  constructor(data = []) {
    this.trials = data;
  }
  push(new_data) {
    this.trials.push(new_data);
    return this;
  }
  join(other_data_collection) {
    this.trials = this.trials.concat(other_data_collection.values());
    return this;
  }
  top() {
    if (this.trials.length <= 1) {
      return this;
    } else {
      return new DataCollection([this.trials[this.trials.length - 1]]);
    }
  }
  /**
   * Queries the first n elements in a collection of trials.
   *
   * @param n A positive integer of elements to return. A value of
   *          n that is less than 1 will throw an error.
   *
   * @return First n objects of a collection of trials. If fewer than
   *         n trials are available, the trials.length elements will
   *         be returned.
   *
   */
  first(n = 1) {
    if (n < 1) {
      throw `You must query with a positive nonzero integer. Please use a
               different value for n.`;
    }
    if (this.trials.length === 0) return new DataCollection();
    if (n > this.trials.length) n = this.trials.length;
    return new DataCollection(this.trials.slice(0, n));
  }
  /**
   * Queries the last n elements in a collection of trials.
   *
   * @param n A positive integer of elements to return. A value of
   *          n that is less than 1 will throw an error.
   *
   * @return Last n objects of a collection of trials. If fewer than
   *         n trials are available, the trials.length elements will
   *         be returned.
   *
   */
  last(n = 1) {
    if (n < 1) {
      throw `You must query with a positive nonzero integer. Please use a
               different value for n.`;
    }
    if (this.trials.length === 0) return new DataCollection();
    if (n > this.trials.length) n = this.trials.length;
    return new DataCollection(this.trials.slice(this.trials.length - n, this.trials.length));
  }
  values() {
    return this.trials;
  }
  count() {
    return this.trials.length;
  }
  readOnly() {
    return new DataCollection(deepCopy(this.trials));
  }
  addToAll(properties) {
    for (const trial of this.trials) {
      Object.assign(trial, properties);
    }
    return this;
  }
  addToLast(properties) {
    if (this.trials.length > 0) {
      Object.assign(this.trials[this.trials.length - 1], properties);
    }
    return this;
  }
  filter(filters) {
    let f;
    if (!Array.isArray(filters)) {
      f = deepCopy([filters]);
    } else {
      f = deepCopy(filters);
    }
    const filtered_data = [];
    for (const trial of this.trials) {
      let keep = false;
      for (const filter of f) {
        let match = true;
        for (const key of Object.keys(filter)) {
          if (typeof trial[key] !== "undefined" && trial[key] === filter[key]) ; else {
            match = false;
          }
        }
        if (match) {
          keep = true;
          break;
        }
      }
      if (keep) {
        filtered_data.push(trial);
      }
    }
    return new DataCollection(filtered_data);
  }
  filterCustom(fn) {
    return new DataCollection(this.trials.filter(fn));
  }
  filterColumns(columns) {
    return new DataCollection(
      this.trials.map(
        (trial) => Object.fromEntries(columns.filter((key) => key in trial).map((key) => [key, trial[key]]))
      )
    );
  }
  select(column) {
    const values = [];
    for (const trial of this.trials) {
      if (typeof trial[column] !== "undefined") {
        values.push(trial[column]);
      }
    }
    return new DataColumn(values);
  }
  ignore(columns) {
    if (!Array.isArray(columns)) {
      columns = [columns];
    }
    const o = deepCopy(this.trials);
    for (const trial of o) {
      for (const delete_key of columns) {
        delete trial[delete_key];
      }
    }
    return new DataCollection(o);
  }
  uniqueNames() {
    const names = [];
    for (const trial of this.trials) {
      for (const key of Object.keys(trial)) {
        if (!names.includes(key)) {
          names.push(key);
        }
      }
    }
    return names;
  }
  csv() {
    return JSON2CSV(this.trials);
  }
  json(pretty = false) {
    if (pretty) {
      return JSON.stringify(this.trials, null, "	");
    }
    return JSON.stringify(this.trials);
  }
  localSave(format, filename) {
    format = format.toLowerCase();
    let data_string;
    if (format === "json") {
      data_string = this.json();
    } else if (format === "csv") {
      data_string = this.csv();
    } else {
      throw new Error('Invalid format specified for localSave. Must be "json" or "csv".');
    }
    saveTextToFile(data_string, filename);
  }
}

class JsPsychData {
  constructor(dependencies) {
    this.dependencies = dependencies;
    /** Data properties for all trials */
    this.dataProperties = {};
    this.interactionListeners = {
      blur: () => {
        this.addInteractionRecord("blur");
      },
      focus: () => {
        this.addInteractionRecord("focus");
      },
      fullscreenchange: () => {
        this.addInteractionRecord(
          // @ts-expect-error
          document.isFullScreen || // @ts-expect-error
          document.webkitIsFullScreen || // @ts-expect-error
          document.mozIsFullScreen || document.fullscreenElement ? "fullscreenenter" : "fullscreenexit"
        );
      }
    };
    this.reset();
  }
  reset() {
    this.results = new DataCollection();
    this.resultToTrialMap = /* @__PURE__ */ new WeakMap();
    this.interactionRecords = new DataCollection();
  }
  get() {
    return this.results;
  }
  getInteractionData() {
    return this.interactionRecords;
  }
  write(trial) {
    const result = trial.getResult();
    Object.assign(result, this.dataProperties);
    this.results.push(result);
    this.resultToTrialMap.set(result, trial);
  }
  addProperties(properties) {
    this.results.addToAll(properties);
    this.dataProperties = Object.assign({}, this.dataProperties, properties);
  }
  addDataToLastTrial(data) {
    this.results.addToLast(data);
  }
  getLastTrialData() {
    return this.results.top();
  }
  getLastTimelineData() {
    const lastResult = this.getLastTrialData().values()[0];
    return new DataCollection(
      lastResult ? this.resultToTrialMap.get(lastResult).parent.getResults() : []
    );
  }
  displayData(format = "json") {
    format = format.toLowerCase();
    if (format !== "json" && format !== "csv") {
      console.log("Invalid format declared for displayData function. Using json as default.");
      format = "json";
    }
    const dataContainer = document.createElement("pre");
    dataContainer.id = "jspsych-data-display";
    dataContainer.textContent = format === "json" ? this.results.json(true) : this.results.csv();
    this.dependencies.getDisplayElement().replaceChildren(dataContainer);
  }
  urlVariables() {
    if (typeof this.query_string == "undefined") {
      this.query_string = getQueryString();
    }
    return this.query_string;
  }
  getURLVariable(whichvar) {
    return this.urlVariables()[whichvar];
  }
  addInteractionRecord(event) {
    const record = { event, ...this.dependencies.getProgress() };
    this.interactionRecords.push(record);
    this.dependencies.onInteractionRecordAdded(record);
  }
  createInteractionListeners() {
    window.addEventListener("blur", this.interactionListeners.blur);
    window.addEventListener("focus", this.interactionListeners.focus);
    document.addEventListener("fullscreenchange", this.interactionListeners.fullscreenchange);
    document.addEventListener("mozfullscreenchange", this.interactionListeners.fullscreenchange);
    document.addEventListener("webkitfullscreenchange", this.interactionListeners.fullscreenchange);
  }
  removeInteractionListeners() {
    window.removeEventListener("blur", this.interactionListeners.blur);
    window.removeEventListener("focus", this.interactionListeners.focus);
    document.removeEventListener("fullscreenchange", this.interactionListeners.fullscreenchange);
    document.removeEventListener("mozfullscreenchange", this.interactionListeners.fullscreenchange);
    document.removeEventListener(
      "webkitfullscreenchange",
      this.interactionListeners.fullscreenchange
    );
  }
}

class KeyboardListenerAPI {
  constructor(getRootElement, areResponsesCaseSensitive = false, minimumValidRt = 0) {
    this.getRootElement = getRootElement;
    this.areResponsesCaseSensitive = areResponsesCaseSensitive;
    this.minimumValidRt = minimumValidRt;
    this.listeners = /* @__PURE__ */ new Set();
    this.heldKeys = /* @__PURE__ */ new Set();
    this.areRootListenersRegistered = false;
    autoBind(this);
    this.registerRootListeners();
  }
  /**
   * If not previously done and `this.getRootElement()` returns an element, adds the root key
   * listeners to that element.
   */
  registerRootListeners() {
    if (!this.areRootListenersRegistered) {
      const rootElement = this.getRootElement();
      if (rootElement) {
        rootElement.addEventListener("keydown", this.rootKeydownListener);
        rootElement.addEventListener("keyup", this.rootKeyupListener);
        this.areRootListenersRegistered = true;
      }
    }
  }
  rootKeydownListener(e) {
    for (const listener of [...this.listeners]) {
      listener(e);
    }
    this.heldKeys.add(this.toLowerCaseIfInsensitive(e.key));
  }
  toLowerCaseIfInsensitive(string) {
    return this.areResponsesCaseSensitive ? string : string.toLowerCase();
  }
  rootKeyupListener(e) {
    this.heldKeys.delete(this.toLowerCaseIfInsensitive(e.key));
  }
  isResponseValid(validResponses, allowHeldKey, key) {
    if (!allowHeldKey && this.heldKeys.has(key)) {
      return false;
    }
    if (validResponses === "ALL_KEYS") {
      return true;
    }
    if (validResponses === "NO_KEYS") {
      return false;
    }
    return validResponses.includes(key);
  }
  getKeyboardResponse({
    callback_function,
    valid_responses = "ALL_KEYS",
    rt_method = "performance",
    persist,
    audio_context,
    audio_context_start_time,
    allow_held_key = false,
    minimum_valid_rt = this.minimumValidRt
  }) {
    if (rt_method !== "performance" && rt_method !== "audio") {
      console.log(
        'Invalid RT method specified in getKeyboardResponse. Defaulting to "performance" method.'
      );
      rt_method = "performance";
    }
    const usePerformanceRt = rt_method === "performance";
    const startTime = usePerformanceRt ? performance.now() : audio_context_start_time * 1e3;
    this.registerRootListeners();
    if (!this.areResponsesCaseSensitive && typeof valid_responses !== "string") {
      valid_responses = valid_responses.map((r) => r.toLowerCase());
    }
    const listener = (e) => {
      const rt = Math.round(
        (rt_method == "performance" ? performance.now() : audio_context.currentTime * 1e3) - startTime
      );
      if (rt < minimum_valid_rt) {
        return;
      }
      const key = this.toLowerCaseIfInsensitive(e.key);
      if (this.isResponseValid(valid_responses, allow_held_key, key)) {
        e.preventDefault();
        if (!persist) {
          this.cancelKeyboardResponse(listener);
        }
        callback_function({ key: e.key, rt });
      }
    };
    this.listeners.add(listener);
    return listener;
  }
  cancelKeyboardResponse(listener) {
    this.listeners.delete(listener);
  }
  cancelAllKeyboardResponses() {
    this.listeners.clear();
  }
  compareKeys(key1, key2) {
    if (typeof key1 !== "string" && key1 !== null || typeof key2 !== "string" && key2 !== null) {
      console.error(
        "Error in jsPsych.pluginAPI.compareKeys: arguments must be key strings or null."
      );
      return void 0;
    }
    if (typeof key1 === "string" && typeof key2 === "string") {
      return this.areResponsesCaseSensitive ? key1 === key2 : key1.toLowerCase() === key2.toLowerCase();
    }
    return key1 === null && key2 === null;
  }
}

var ParameterType = /* @__PURE__ */ ((ParameterType2) => {
  ParameterType2[ParameterType2["BOOL"] = 0] = "BOOL";
  ParameterType2[ParameterType2["STRING"] = 1] = "STRING";
  ParameterType2[ParameterType2["INT"] = 2] = "INT";
  ParameterType2[ParameterType2["FLOAT"] = 3] = "FLOAT";
  ParameterType2[ParameterType2["FUNCTION"] = 4] = "FUNCTION";
  ParameterType2[ParameterType2["KEY"] = 5] = "KEY";
  ParameterType2[ParameterType2["KEYS"] = 6] = "KEYS";
  ParameterType2[ParameterType2["SELECT"] = 7] = "SELECT";
  ParameterType2[ParameterType2["HTML_STRING"] = 8] = "HTML_STRING";
  ParameterType2[ParameterType2["IMAGE"] = 9] = "IMAGE";
  ParameterType2[ParameterType2["AUDIO"] = 10] = "AUDIO";
  ParameterType2[ParameterType2["VIDEO"] = 11] = "VIDEO";
  ParameterType2[ParameterType2["OBJECT"] = 12] = "OBJECT";
  ParameterType2[ParameterType2["COMPLEX"] = 13] = "COMPLEX";
  ParameterType2[ParameterType2["TIMELINE"] = 14] = "TIMELINE";
  return ParameterType2;
})(ParameterType || {});

class AudioPlayer {
  constructor(src, options = { useWebAudio: false }) {
    this.src = src;
    this.useWebAudio = options.useWebAudio;
    this.audioContext = options.audioContext || null;
  }
  async load() {
    if (this.useWebAudio) {
      this.webAudioBuffer = await this.preloadWebAudio(this.src);
    } else {
      this.audio = await this.preloadHTMLAudio(this.src);
    }
  }
  play() {
    if (this.audio instanceof HTMLAudioElement) {
      this.audio.play();
    } else {
      if (!this.audio) this.audio = this.getAudioSourceNode(this.webAudioBuffer);
      this.audio.start();
    }
  }
  stop() {
    if (this.audio instanceof HTMLAudioElement) {
      this.audio.pause();
      this.audio.currentTime = 0;
    } else {
      this.audio.stop();
      this.audio = this.getAudioSourceNode(this.webAudioBuffer);
    }
  }
  addEventListener(eventName, callback) {
    if (!this.audio && this.webAudioBuffer)
      this.audio = this.getAudioSourceNode(this.webAudioBuffer);
    this.audio.addEventListener(eventName, callback);
  }
  removeEventListener(eventName, callback) {
    if (!this.audio && this.webAudioBuffer)
      this.audio = this.getAudioSourceNode(this.webAudioBuffer);
    this.audio.removeEventListener(eventName, callback);
  }
  getAudioSourceNode(audioBuffer) {
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    return source;
  }
  async preloadWebAudio(src) {
    const buffer = await fetch(src);
    const arrayBuffer = await buffer.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    return audioBuffer;
  }
  async preloadHTMLAudio(src) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(src);
      audio.addEventListener("canplaythrough", () => {
        resolve(audio);
      });
      audio.addEventListener("error", (err) => {
        reject(err);
      });
      audio.addEventListener("abort", (err) => {
        reject(err);
      });
    });
  }
}

const preloadParameterTypes = [
  ParameterType.AUDIO,
  ParameterType.IMAGE,
  ParameterType.VIDEO
];
class MediaAPI {
  constructor(useWebaudio) {
    this.useWebaudio = useWebaudio;
    // video //
    this.video_buffers = {};
    // audio //
    this.context = null;
    this.audio_buffers = [];
    // preloading stimuli //
    this.preload_requests = [];
    this.img_cache = {};
    this.preloadMap = /* @__PURE__ */ new Map();
    this.microphone_recorder = null;
    this.camera_stream = null;
    this.camera_recorder = null;
    if (this.useWebaudio && typeof window !== "undefined" && typeof window.AudioContext !== "undefined") {
      this.context = new AudioContext();
    }
  }
  getVideoBuffer(videoID) {
    if (videoID.startsWith("blob:")) {
      this.video_buffers[videoID] = videoID;
    }
    return this.video_buffers[videoID];
  }
  audioContext() {
    if (this.context && this.context.state !== "running") {
      this.context.resume();
    }
    return this.context;
  }
  async getAudioPlayer(audioID) {
    if (this.audio_buffers[audioID] instanceof AudioPlayer) {
      return this.audio_buffers[audioID];
    } else {
      this.audio_buffers[audioID] = new AudioPlayer(audioID, {
        useWebAudio: this.useWebaudio,
        audioContext: this.context
      });
      await this.audio_buffers[audioID].load();
      return this.audio_buffers[audioID];
    }
  }
  preloadAudio(files, callback_complete = () => {
  }, callback_load = (filepath) => {
  }, callback_error = (error) => {
  }) {
    files = unique(files.flat());
    let n_loaded = 0;
    if (files.length == 0) {
      callback_complete();
      return;
    }
    for (const file of files) {
      if (this.audio_buffers[file] instanceof AudioPlayer) {
        n_loaded++;
        callback_load(file);
        if (n_loaded == files.length) {
          callback_complete();
        }
      } else {
        this.audio_buffers[file] = new AudioPlayer(file, {
          useWebAudio: this.useWebaudio,
          audioContext: this.context
        });
        this.audio_buffers[file].load().then(() => {
          n_loaded++;
          callback_load(file);
          if (n_loaded == files.length) {
            callback_complete();
          }
        }).catch((e) => {
          callback_error(e);
        });
      }
    }
  }
  preloadImages(images, callback_complete = () => {
  }, callback_load = (filepath) => {
  }, callback_error = (error_msg) => {
  }) {
    images = unique(images.flat());
    var n_loaded = 0;
    if (images.length === 0) {
      callback_complete();
      return;
    }
    for (let i = 0; i < images.length; i++) {
      const img = new Image();
      const src = images[i];
      img.onload = () => {
        n_loaded++;
        callback_load(src);
        if (n_loaded === images.length) {
          callback_complete();
        }
      };
      img.onerror = (e) => {
        callback_error({ source: src, error: e });
      };
      img.src = src;
      this.img_cache[src] = img;
      this.preload_requests.push(img);
    }
  }
  preloadVideo(videos, callback_complete = () => {
  }, callback_load = (filepath) => {
  }, callback_error = (error_msg) => {
  }) {
    videos = unique(videos.flat());
    let n_loaded = 0;
    if (videos.length === 0) {
      callback_complete();
      return;
    }
    for (const video of videos) {
      const video_buffers = this.video_buffers;
      const request = new XMLHttpRequest();
      request.open("GET", video, true);
      request.responseType = "blob";
      request.onload = () => {
        if (request.status === 200 || request.status === 0) {
          const videoBlob = request.response;
          video_buffers[video] = URL.createObjectURL(videoBlob);
          n_loaded++;
          callback_load(video);
          if (n_loaded === videos.length) {
            callback_complete();
          }
        }
      };
      request.onerror = (e) => {
        let err = e;
        if (request.status == 404) {
          err = "404";
        }
        callback_error({ source: video, error: err });
      };
      request.onloadend = (e) => {
        if (request.status == 404) {
          callback_error({ source: video, error: "404" });
        }
      };
      request.send();
      this.preload_requests.push(request);
    }
  }
  getAutoPreloadList(timeline_description) {
    const preloadPaths = Object.fromEntries(
      preloadParameterTypes.map((type) => [type, /* @__PURE__ */ new Set()])
    );
    const traverseTimeline = (node, inheritedTrialType) => {
      const isTimeline = typeof node.timeline !== "undefined";
      if (isTimeline) {
        for (const childNode of node.timeline) {
          traverseTimeline(childNode, node.type ?? inheritedTrialType);
        }
      } else if ((node.type ?? inheritedTrialType)?.info) {
        const { name: pluginName, parameters } = (node.type ?? inheritedTrialType).info;
        if (!this.preloadMap.has(pluginName)) {
          this.preloadMap.set(
            pluginName,
            Object.fromEntries(
              Object.entries(parameters).filter(
                ([_name, { type, preload }]) => preloadParameterTypes.includes(type) && (preload ?? true)
              ).map(([name, { type }]) => [name, type])
            )
          );
        }
        for (const [parameterName, parameterType] of Object.entries(
          this.preloadMap.get(pluginName)
        )) {
          const parameterValue = node[parameterName];
          const elements = preloadPaths[parameterType];
          if (typeof parameterValue === "string") {
            elements.add(parameterValue);
          } else if (Array.isArray(parameterValue)) {
            for (const element of parameterValue.flat()) {
              if (typeof element === "string") {
                elements.add(element);
              }
            }
          }
        }
      }
    };
    traverseTimeline({ timeline: timeline_description });
    return {
      images: [...preloadPaths[ParameterType.IMAGE]],
      audio: [...preloadPaths[ParameterType.AUDIO]],
      video: [...preloadPaths[ParameterType.VIDEO]]
    };
  }
  cancelPreloads() {
    for (const request of this.preload_requests) {
      request.onload = () => {
      };
      request.onerror = () => {
      };
      request.oncanplaythrough = () => {
      };
      request.onabort = () => {
      };
    }
    this.preload_requests = [];
  }
  initializeMicrophoneRecorder(stream) {
    const recorder = new MediaRecorder(stream);
    this.microphone_recorder = recorder;
  }
  getMicrophoneRecorder() {
    return this.microphone_recorder;
  }
  initializeCameraRecorder(stream, opts) {
    this.camera_stream = stream;
    const recorder = new MediaRecorder(stream, opts);
    this.camera_recorder = recorder;
  }
  getCameraStream() {
    return this.camera_stream;
  }
  getCameraRecorder() {
    return this.camera_recorder;
  }
}

class SimulationAPI {
  constructor(getDisplayContainerElement, setJsPsychTimeout) {
    this.getDisplayContainerElement = getDisplayContainerElement;
    this.setJsPsychTimeout = setJsPsychTimeout;
  }
  dispatchEvent(event) {
    this.getDisplayContainerElement().dispatchEvent(event);
  }
  /**
   * Dispatches a `keydown` event for the specified key
   * @param key Character code (`.key` property) for the key to press.
   */
  keyDown(key) {
    this.dispatchEvent(new KeyboardEvent("keydown", { key }));
  }
  /**
   * Dispatches a `keyup` event for the specified key
   * @param key Character code (`.key` property) for the key to press.
   */
  keyUp(key) {
    this.dispatchEvent(new KeyboardEvent("keyup", { key }));
  }
  /**
   * Dispatches a `keydown` and `keyup` event in sequence to simulate pressing a key.
   * @param key Character code (`.key` property) for the key to press.
   * @param delay Length of time to wait (ms) before executing action
   */
  pressKey(key, delay = 0) {
    if (delay > 0) {
      this.setJsPsychTimeout(() => {
        this.keyDown(key);
        this.keyUp(key);
      }, delay);
    } else {
      this.keyDown(key);
      this.keyUp(key);
    }
  }
  /**
   * Dispatches `mousedown`, `mouseup`, and `click` events on the target element
   * @param target The element to click
   * @param delay Length of time to wait (ms) before executing action
   */
  clickTarget(target, delay = 0) {
    if (delay > 0) {
      this.setJsPsychTimeout(() => {
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }, delay);
    } else {
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }
  /**
   * Sets the value of a target text input
   * @param target A text input element to fill in
   * @param text Text to input
   * @param delay Length of time to wait (ms) before executing action
   */
  fillTextInput(target, text, delay = 0) {
    if (delay > 0) {
      this.setJsPsychTimeout(() => {
        target.value = text;
      }, delay);
    } else {
      target.value = text;
    }
  }
  /**
   * Picks a valid key from `choices`, taking into account jsPsych-specific
   * identifiers like "NO_KEYS" and "ALL_KEYS".
   * @param choices Which keys are valid.
   * @returns A key selected at random from the valid keys.
   */
  getValidKey(choices) {
    const possible_keys = [
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
      "o",
      "p",
      "q",
      "r",
      "s",
      "t",
      "u",
      "v",
      "w",
      "x",
      "y",
      "z",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      " "
    ];
    let key;
    if (choices == "NO_KEYS") {
      key = null;
    } else if (choices == "ALL_KEYS") {
      key = possible_keys[Math.floor(Math.random() * possible_keys.length)];
    } else {
      const flat_choices = choices.flat();
      key = flat_choices[Math.floor(Math.random() * flat_choices.length)];
    }
    return key;
  }
  mergeSimulationData(default_data, simulation_options) {
    return {
      ...default_data,
      ...simulation_options?.data
    };
  }
  ensureSimulationDataConsistency(trial, data) {
    if (data.rt) {
      data.rt = Math.round(data.rt);
    }
    if (trial.trial_duration && data.rt && data.rt > trial.trial_duration) {
      data.rt = null;
      if (data.response) {
        data.response = null;
      }
      if (data.correct) {
        data.correct = false;
      }
    }
    if (trial.choices && trial.choices == "NO_KEYS") {
      if (data.rt) {
        data.rt = null;
      }
      if (data.response) {
        data.response = null;
      }
    }
    if (trial.allow_response_before_complete) {
      if (trial.sequence_reps && trial.frame_time) {
        const min_time = trial.sequence_reps * trial.frame_time * trial.stimuli.length;
        if (data.rt < min_time) {
          data.rt = null;
          data.response = null;
        }
      }
    }
  }
}

class TimeoutAPI {
  constructor() {
    this.timeout_handlers = [];
  }
  /**
   * Calls a function after a specified delay, in milliseconds.
   * @param callback The function to call after the delay.
   * @param delay The number of milliseconds to wait before calling the function.
   * @returns A handle that can be used to clear the timeout with clearTimeout.
   */
  setTimeout(callback, delay) {
    const handle = window.setTimeout(callback, delay);
    this.timeout_handlers.push(handle);
    return handle;
  }
  /**
   * Clears all timeouts that have been created with setTimeout.
   */
  clearAllTimeouts() {
    for (const handler of this.timeout_handlers) {
      clearTimeout(handler);
    }
    this.timeout_handlers = [];
  }
}

function createJointPluginAPIObject(jsPsych) {
  const settings = jsPsych.getInitSettings();
  const keyboardListenerAPI = new KeyboardListenerAPI(
    jsPsych.getDisplayContainerElement,
    settings.case_sensitive_responses,
    settings.minimum_valid_rt
  );
  const timeoutAPI = new TimeoutAPI();
  const mediaAPI = new MediaAPI(settings.use_webaudio);
  const simulationAPI = new SimulationAPI(
    jsPsych.getDisplayContainerElement,
    timeoutAPI.setTimeout.bind(timeoutAPI)
  );
  return Object.assign(
    {},
    ...[keyboardListenerAPI, timeoutAPI, mediaAPI, simulationAPI].map((object) => autoBind(object))
  );
}

function setSeed(seed = Math.random().toString()) {
  Math.random = seedrandom(seed);
  return seed;
}
function repeat(array, repetitions, unpack = false) {
  const arr_isArray = Array.isArray(array);
  const rep_isArray = Array.isArray(repetitions);
  if (!arr_isArray) {
    if (!rep_isArray) {
      array = [array];
      repetitions = [repetitions];
    } else {
      repetitions = [repetitions[0]];
      console.log(
        "Unclear parameters given to randomization.repeat. Multiple set sizes specified, but only one item exists to sample. Proceeding using the first set size."
      );
    }
  } else {
    if (!rep_isArray) {
      let reps = [];
      for (let i = 0; i < array.length; i++) {
        reps.push(repetitions);
      }
      repetitions = reps;
    } else {
      if (array.length != repetitions.length) {
        console.warn(
          "Unclear parameters given to randomization.repeat. Items and repetitions are unequal lengths. Behavior may not be as expected."
        );
        if (repetitions.length < array.length) {
          let reps = [];
          for (let i = 0; i < array.length; i++) {
            reps.push(repetitions);
          }
          repetitions = reps;
        } else {
          repetitions = repetitions.slice(0, array.length);
        }
      }
    }
  }
  let allsamples = [];
  for (let i = 0; i < array.length; i++) {
    for (let j = 0; j < repetitions[i]; j++) {
      if (array[i] == null || typeof array[i] != "object") {
        allsamples.push(array[i]);
      } else {
        allsamples.push(Object.assign({}, array[i]));
      }
    }
  }
  let out = shuffle(allsamples);
  if (unpack) {
    out = unpackArray(out);
  }
  return out;
}
function shuffle(array) {
  if (!Array.isArray(array)) {
    console.error("Argument to shuffle() must be an array.");
  }
  const copy_array = array.slice(0);
  let m = copy_array.length, t, i;
  while (m) {
    i = Math.floor(Math.random() * m--);
    t = copy_array[m];
    copy_array[m] = copy_array[i];
    copy_array[i] = t;
  }
  return copy_array;
}
function shuffleNoRepeats(arr, equalityTest) {
  if (!Array.isArray(arr)) {
    console.error("First argument to shuffleNoRepeats() must be an array.");
  }
  if (typeof equalityTest !== "undefined" && typeof equalityTest !== "function") {
    console.error("Second argument to shuffleNoRepeats() must be a function.");
  }
  if (typeof equalityTest == "undefined") {
    equalityTest = function(a, b) {
      if (a === b) {
        return true;
      } else {
        return false;
      }
    };
  }
  const random_shuffle = shuffle(arr);
  for (let i = 0; i < random_shuffle.length - 1; i++) {
    if (equalityTest(random_shuffle[i], random_shuffle[i + 1])) {
      let random_pick = Math.floor(Math.random() * (random_shuffle.length - 2)) + 1;
      while (equalityTest(random_shuffle[i + 1], random_shuffle[random_pick]) || equalityTest(random_shuffle[i + 1], random_shuffle[random_pick + 1]) || equalityTest(random_shuffle[i + 1], random_shuffle[random_pick - 1]) || equalityTest(random_shuffle[i], random_shuffle[random_pick])) {
        random_pick = Math.floor(Math.random() * (random_shuffle.length - 2)) + 1;
      }
      const new_neighbor = random_shuffle[random_pick];
      random_shuffle[random_pick] = random_shuffle[i + 1];
      random_shuffle[i + 1] = new_neighbor;
    }
  }
  return random_shuffle;
}
function shuffleAlternateGroups(arr_groups, random_group_order = false) {
  const n_groups = arr_groups.length;
  if (n_groups == 1) {
    console.warn(
      "shuffleAlternateGroups() was called with only one group. Defaulting to simple shuffle."
    );
    return shuffle(arr_groups[0]);
  }
  let group_order = [];
  for (let i = 0; i < n_groups; i++) {
    group_order.push(i);
  }
  if (random_group_order) {
    group_order = shuffle(group_order);
  }
  const randomized_groups = [];
  let min_length = null;
  for (let i = 0; i < n_groups; i++) {
    min_length = min_length === null ? arr_groups[i].length : Math.min(min_length, arr_groups[i].length);
    randomized_groups.push(shuffle(arr_groups[i]));
  }
  const out = [];
  for (let i = 0; i < min_length; i++) {
    for (let j = 0; j < group_order.length; j++) {
      out.push(randomized_groups[group_order[j]][i]);
    }
  }
  return out;
}
function sampleWithoutReplacement(arr, size) {
  if (!Array.isArray(arr)) {
    console.error("First argument to sampleWithoutReplacement() must be an array");
  }
  if (size > arr.length) {
    console.error("Cannot take a sample larger than the size of the set of items to sample.");
  }
  return shuffle(arr).slice(0, size);
}
function sampleWithReplacement(arr, size, weights) {
  if (!Array.isArray(arr)) {
    console.error("First argument to sampleWithReplacement() must be an array");
  }
  const normalized_weights = [];
  if (typeof weights !== "undefined") {
    if (weights.length !== arr.length) {
      console.error(
        "The length of the weights array must equal the length of the array to be sampled from."
      );
    }
    let weight_sum = 0;
    for (const weight of weights) {
      weight_sum += weight;
    }
    for (const weight of weights) {
      normalized_weights.push(weight / weight_sum);
    }
  } else {
    for (let i = 0; i < arr.length; i++) {
      normalized_weights.push(1 / arr.length);
    }
  }
  const cumulative_weights = [normalized_weights[0]];
  for (let i = 1; i < normalized_weights.length; i++) {
    cumulative_weights.push(normalized_weights[i] + cumulative_weights[i - 1]);
  }
  const samp = [];
  for (let i = 0; i < size; i++) {
    const rnd = Math.random();
    let index = 0;
    while (rnd > cumulative_weights[index]) {
      index++;
    }
    samp.push(arr[index]);
  }
  return samp;
}
function factorial(factors, repetitions = 1, unpack = false) {
  let design = [{}];
  for (const [factorName, factor] of Object.entries(factors)) {
    const new_design = [];
    for (const level of factor) {
      for (const cell of design) {
        new_design.push({ ...cell, [factorName]: level });
      }
    }
    design = new_design;
  }
  return repeat(design, repetitions, unpack);
}
function randomID(length = 32) {
  let result = "";
  const chars = "0123456789abcdefghjklmnopqrstuvwxyz";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
function randomInt(lower, upper) {
  if (upper < lower) {
    throw new Error("Upper boundary must be greater than or equal to lower boundary");
  }
  return lower + Math.floor(Math.random() * (upper - lower + 1));
}
function sampleBernoulli(p) {
  return Math.random() <= p ? 1 : 0;
}
function sampleNormal(mean, standard_deviation) {
  return randn_bm() * standard_deviation + mean;
}
function sampleExponential(rate) {
  return -Math.log(Math.random()) / rate;
}
function sampleExGaussian(mean, standard_deviation, rate, positive = false) {
  let s = sampleNormal(mean, standard_deviation) + sampleExponential(rate);
  if (positive) {
    while (s <= 0) {
      s = sampleNormal(mean, standard_deviation) + sampleExponential(rate);
    }
  }
  return s;
}
function randomWords(opts) {
  return rw(opts);
}
function randn_bm() {
  var u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function unpackArray(array) {
  const out = {};
  for (const x of array) {
    for (const key of Object.keys(x)) {
      if (typeof out[key] === "undefined") {
        out[key] = [];
      }
      out[key].push(x[key]);
    }
  }
  return out;
}

var randomization = /*#__PURE__*/Object.freeze({
  __proto__: null,
  factorial: factorial,
  randomID: randomID,
  randomInt: randomInt,
  randomWords: randomWords,
  repeat: repeat,
  sampleBernoulli: sampleBernoulli,
  sampleExGaussian: sampleExGaussian,
  sampleExponential: sampleExponential,
  sampleNormal: sampleNormal,
  sampleWithReplacement: sampleWithReplacement,
  sampleWithoutReplacement: sampleWithoutReplacement,
  setSeed: setSeed,
  shuffle: shuffle,
  shuffleAlternateGroups: shuffleAlternateGroups,
  shuffleNoRepeats: shuffleNoRepeats
});

function turkInfo() {
  const turk = {
    previewMode: false,
    outsideTurk: false,
    hitId: "INVALID_URL_PARAMETER",
    assignmentId: "INVALID_URL_PARAMETER",
    workerId: "INVALID_URL_PARAMETER",
    turkSubmitTo: "INVALID_URL_PARAMETER"
  };
  const param = function(url, name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    const regexS = "[\\?&]" + name + "=([^&#]*)";
    const regex = new RegExp(regexS);
    const results = regex.exec(url);
    return results == null ? "" : results[1];
  };
  const src = param(window.location.href, "assignmentId") ? window.location.href : document.referrer;
  const keys = ["assignmentId", "hitId", "workerId", "turkSubmitTo"];
  keys.map(function(key) {
    turk[key] = unescape(param(src, key));
  });
  turk.previewMode = turk.assignmentId == "ASSIGNMENT_ID_NOT_AVAILABLE";
  turk.outsideTurk = !turk.previewMode && turk.hitId === "" && turk.assignmentId == "" && turk.workerId == "";
  return turk;
}
function submitToTurk(data) {
  const turk = turkInfo();
  const assignmentId = turk.assignmentId;
  const turkSubmitTo = turk.turkSubmitTo;
  if (!assignmentId || !turkSubmitTo) return;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = turkSubmitTo + "/mturk/externalSubmit?assignmentId=" + assignmentId;
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const hiddenField = document.createElement("input");
      hiddenField.type = "hidden";
      hiddenField.name = key;
      hiddenField.id = key;
      hiddenField.value = data[key];
      form.appendChild(hiddenField);
    }
  }
  document.body.appendChild(form);
  form.submit();
}

var turk = /*#__PURE__*/Object.freeze({
  __proto__: null,
  submitToTurk: submitToTurk,
  turkInfo: turkInfo
});

class ProgressBar {
  constructor(containerElement, message) {
    this.containerElement = containerElement;
    this.message = message;
    this._progress = 0;
    this.setupElements();
  }
  /** Adds the progress bar HTML code into `this.containerElement` */
  setupElements() {
    this.messageSpan = document.createElement("span");
    this.innerDiv = document.createElement("div");
    this.innerDiv.id = "jspsych-progressbar-inner";
    this.update();
    const outerDiv = document.createElement("div");
    outerDiv.id = "jspsych-progressbar-outer";
    outerDiv.appendChild(this.innerDiv);
    this.containerElement.appendChild(this.messageSpan);
    this.containerElement.appendChild(outerDiv);
  }
  /** Updates the progress bar according to `this.progress` */
  update() {
    this.innerDiv.style.width = this._progress * 100 + "%";
    if (typeof this.message === "function") {
      this.messageSpan.innerHTML = this.message(this._progress);
    } else {
      this.messageSpan.innerHTML = this.message;
    }
  }
  /**
   * The bar's current position as a number in the closed interval [0, 1]. Set this to update the
   * progress bar accordingly.
   */
  set progress(progress) {
    if (typeof progress !== "number" || progress < 0 || progress > 1) {
      throw new Error("jsPsych.progressBar.progress must be a number between 0 and 1");
    }
    this._progress = progress;
    this.update();
  }
  get progress() {
    return this._progress;
  }
}

class TimelineVariable {
  constructor(name) {
    this.name = name;
  }
}
const timelineDescriptionKeys = [
  "timeline",
  "timeline_variables",
  "name",
  "repetitions",
  "loop_function",
  "conditional_function",
  "randomize_order",
  "sample",
  "on_timeline_start",
  "on_timeline_finish"
];
function isTrialDescription(description) {
  return !isTimelineDescription(description);
}
function isTimelineDescription(description) {
  return Boolean(description.timeline) || Array.isArray(description);
}
var TimelineNodeStatus = /* @__PURE__ */ ((TimelineNodeStatus2) => {
  TimelineNodeStatus2[TimelineNodeStatus2["PENDING"] = 0] = "PENDING";
  TimelineNodeStatus2[TimelineNodeStatus2["RUNNING"] = 1] = "RUNNING";
  TimelineNodeStatus2[TimelineNodeStatus2["PAUSED"] = 2] = "PAUSED";
  TimelineNodeStatus2[TimelineNodeStatus2["COMPLETED"] = 3] = "COMPLETED";
  TimelineNodeStatus2[TimelineNodeStatus2["ABORTED"] = 4] = "ABORTED";
  return TimelineNodeStatus2;
})(TimelineNodeStatus || {});

class PromiseWrapper {
  constructor() {
    this.reset();
  }
  reset() {
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
  get() {
    return this.promise;
  }
  resolve(value) {
    this.resolvePromise(value);
    this.reset();
  }
}
function isPromise(value) {
  return value && typeof value["then"] === "function";
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function parameterPathArrayToString([firstPathElement, ...remainingPathElements]) {
  let pathString = firstPathElement ?? "";
  for (const pathElement of remainingPathElements) {
    pathString += Number.isNaN(Number.parseInt(pathElement)) ? `.${pathElement}` : `[${pathElement}]`;
  }
  return pathString;
}
function isObjectOrArray(value) {
  return typeof value === "object" && value !== null;
}
class ParameterObjectPathCache {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
  }
  static lookupChild(objectOrArray, childName) {
    let doesPathExist = false;
    let childValue;
    if (Number.isNaN(Number.parseInt(childName))) {
      if (Object.hasOwn(objectOrArray, childName)) {
        doesPathExist = true;
        childValue = objectOrArray[childName];
      }
    } else {
      if (Number.parseInt(childName) < objectOrArray.length) {
        doesPathExist = true;
        childValue = objectOrArray[childName];
      }
    }
    return { doesPathExist, value: childValue };
  }
  get(path) {
    return this.cache.get(path.join("."));
  }
  has(path) {
    return this.cache.has(path.join("."));
  }
  initialize(rootObject) {
    this.rootObject = rootObject;
    this.cache.set("", rootObject);
  }
  reset() {
    this.cache.clear();
    this.cache.set("", this.rootObject);
  }
  set(path, value) {
    this.cache.set(path.join("."), value);
  }
  lookup(path) {
    if (this.has(path)) {
      return { doesPathExist: true, value: this.get(path) };
    }
    const lookupPath = (path2) => {
      const parentPath = path2.slice(0, -1);
      const childName = path2[path2.length - 1];
      if (!this.has(parentPath) && parentPath.length > 0) {
        if (!lookupPath(parentPath).doesPathExist) {
          return { doesPathExist: false };
        }
      }
      const parentValue = this.get(parentPath);
      if (!isObjectOrArray(parentValue)) {
        return { doesPathExist: false };
      }
      const lookupResult = ParameterObjectPathCache.lookupChild(parentValue, childName);
      if (lookupResult.doesPathExist) {
        this.set(path2, lookupResult.value);
      }
      return lookupResult;
    };
    return lookupPath(path);
  }
}

class TimelineNode {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.status = TimelineNodeStatus.PENDING;
    this.parameterValueCache = new ParameterObjectPathCache();
  }
  getStatus() {
    return this.status;
  }
  /**
   * Initializes the parameter value cache with `this.description`. To be called by subclass
   * constructors after setting `this.description`.
   */
  initializeParameterValueCache() {
    this.parameterValueCache.initialize(this.description);
  }
  /**
   * Resets all cached parameter values in this timeline node and all of its parents. This is
   * necessary to re-evaluate function parameters and timeline variables at each new trial.
   */
  resetParameterValueCache() {
    this.parameterValueCache.reset();
    this.parent?.resetParameterValueCache();
  }
  /**
   * Retrieves a parameter value from the description of this timeline node, recursively falling
   * back to the description of each parent timeline node unless `recursive` is set to `false`. If
   * the parameter...
   *
   * * is a timeline variable, evaluates the variable and returns the result.
   * * is not specified, returns `undefined`.
   * * is a function and `evaluateFunctions` is not set to `false`, invokes the function and returns
   *   its return value
   * * has previously been looked up, return the cached result of the previous lookup
   *
   * @param parameterPath The path of the respective parameter in the timeline node description. If
   * the path is an array, nested object properties or array items will be looked up.
   * @param options See {@link GetParameterValueOptions}
   */
  getParameterValue(parameterPath, options = {}) {
    const {
      evaluateFunctions = true,
      recursive = true,
      cacheResult = true,
      replaceResult
    } = options;
    if (typeof parameterPath === "string") {
      parameterPath = [parameterPath];
    }
    let { doesPathExist, value: result } = this.parameterValueCache.lookup(parameterPath);
    if (!doesPathExist && recursive && this.parent) {
      result = this.parent.getParameterValue(parameterPath, options);
    }
    if (typeof result === "function" && evaluateFunctions) {
      result = result();
    }
    if (result instanceof TimelineVariable) {
      result = this.evaluateTimelineVariable(result);
    }
    if (typeof replaceResult === "function") {
      result = replaceResult(result);
    }
    if (cacheResult) {
      this.parameterValueCache.set(parameterPath, result);
    }
    return result;
  }
  /**
   * Retrieves and evaluates the `data` parameter. It is different from other parameters in that
   * it's properties may be functions that have to be evaluated, and parent nodes' data parameter
   * properties are merged into the result.
   */
  getDataParameter() {
    const data = this.getParameterValue("data", { recursive: false });
    return {
      ...Object.fromEntries(
        typeof data === "object" ? Object.keys(data).map((key) => [key, this.getParameterValue(["data", key])]) : []
      ),
      ...this.parent?.getDataParameter()
    };
  }
}

class Trial extends TimelineNode {
  constructor(dependencies, description, parent) {
    super(dependencies);
    this.description = description;
    this.parent = parent;
    this.onLoad = () => {
      this.runParameterCallback("on_load");
      this.dependencies.runOnLoadExtensionCallbacks(this.getParameterValue("extensions"));
    };
    this.initializeParameterValueCache();
    this.trialObject = deepCopy(description);
    this.pluginClass = this.getParameterValue("type", { evaluateFunctions: false });
    this.pluginInfo = this.pluginClass["info"];
    if (!("version" in this.pluginInfo) && !("data" in this.pluginInfo)) {
      console.warn(
        this.pluginInfo["name"],
        "is missing the 'version' and 'data' fields. Please update plugin as 'version' and 'data' will be required in v9. See https://www.jspsych.org/latest/developers/plugin-development/ for more details."
      );
    } else if (!("version" in this.pluginInfo)) {
      console.warn(
        this.pluginInfo["name"],
        "is missing the 'version' field. Please update plugin as 'version' will be required in v9. See https://www.jspsych.org/latest/developers/plugin-development/ for more details."
      );
    } else if (!("data" in this.pluginInfo)) {
      console.warn(
        this.pluginInfo["name"],
        "is missing the 'data' field. Please update plugin as 'data' will be required in v9. See https://www.jspsych.org/latest/developers/plugin-development/ for more details."
      );
    }
  }
  async run() {
    this.status = TimelineNodeStatus.RUNNING;
    this.processParameters();
    this.onStart();
    this.addCssClasses();
    this.pluginInstance = this.dependencies.instantiatePlugin(this.pluginClass);
    this.result = this.processResult(await this.executeTrial());
    this.dependencies.onTrialResultAvailable(this);
    this.status = TimelineNodeStatus.COMPLETED;
    await this.onFinish();
    this.removeCssClasses();
    const gap = this.getParameterValue("post_trial_gap") ?? this.dependencies.getDefaultIti();
    if (gap !== 0 && this.dependencies.getSimulationMode() !== "data-only") {
      await delay(gap);
    }
    this.resetParameterValueCache();
  }
  async executeTrial() {
    const trialPromise = this.dependencies.finishTrialPromise.get();
    let hasTrialPromiseBeenResolved = false;
    trialPromise.then(() => {
      hasTrialPromiseBeenResolved = true;
    });
    const { trialReturnValue, hasTrialBeenSimulated } = this.invokeTrialMethod();
    let result;
    if (isPromise(trialReturnValue)) {
      result = await Promise.race([trialReturnValue, trialPromise]);
      if (hasTrialPromiseBeenResolved) {
        result = await trialPromise;
      }
    } else {
      if (!hasTrialBeenSimulated) {
        this.onLoad();
      }
      result = await trialPromise;
    }
    this.cleanupTrial();
    return result;
  }
  invokeTrialMethod() {
    const globalSimulationMode = this.dependencies.getSimulationMode();
    if (globalSimulationMode && typeof this.pluginInstance.simulate === "function") {
      const simulationOptions = this.getSimulationOptions();
      if (simulationOptions.simulate !== false) {
        return {
          hasTrialBeenSimulated: true,
          trialReturnValue: this.pluginInstance.simulate(
            this.trialObject,
            simulationOptions.mode ?? globalSimulationMode,
            simulationOptions,
            this.onLoad
          )
        };
      }
    }
    return {
      hasTrialBeenSimulated: false,
      trialReturnValue: this.pluginInstance.trial(
        this.dependencies.getDisplayElement(),
        this.trialObject,
        this.onLoad
      )
    };
  }
  /**
   * Cleanup the trial by removing the display element and removing event listeners
   */
  cleanupTrial() {
    this.dependencies.clearAllTimeouts();
    this.dependencies.getDisplayElement().innerHTML = "";
  }
  /**
   * Add the CSS classes from the `css_classes` parameter to the display element
   */
  addCssClasses() {
    const classes = this.getParameterValue("css_classes");
    const classList = this.dependencies.getDisplayElement().classList;
    if (typeof classes === "string") {
      classList.add(classes);
    } else if (Array.isArray(classes)) {
      classList.add(...classes);
    }
  }
  /**
   * Removes the provided css classes from the display element
   */
  removeCssClasses() {
    const classes = this.getParameterValue("css_classes");
    if (classes) {
      this.dependencies.getDisplayElement().classList.remove(...typeof classes === "string" ? [classes] : classes);
    }
  }
  processResult(result) {
    if (!result) {
      result = {};
    }
    for (const [parameterName, shouldParameterBeIncluded] of Object.entries(
      this.getParameterValue("save_trial_parameters") ?? {}
    )) {
      if (this.pluginInfo.parameters[parameterName]) {
        if (shouldParameterBeIncluded && !Object.hasOwn(result, parameterName)) {
          let parameterValue = this.trialObject[parameterName];
          if (typeof parameterValue === "function") {
            parameterValue = parameterValue.toString();
          }
          result[parameterName] = parameterValue;
        } else if (!shouldParameterBeIncluded && Object.hasOwn(result, parameterName)) {
          delete result[parameterName];
        }
      } else {
        console.warn(
          `Non-existent parameter "${parameterName}" specified in save_trial_parameters.`
        );
      }
    }
    result = {
      ...this.getDataParameter(),
      ...result,
      trial_type: this.pluginInfo.name,
      trial_index: this.index,
      plugin_version: this.pluginInfo["version"] ? this.pluginInfo["version"] : null
    };
    const saveTimelineVariables = this.getParameterValue("save_timeline_variables");
    if (saveTimelineVariables === true) {
      result.timeline_variables = { ...this.parent.getAllTimelineVariables() };
    } else if (Array.isArray(saveTimelineVariables)) {
      result.timeline_variables = Object.fromEntries(
        Object.entries(this.parent.getAllTimelineVariables()).filter(
          ([key, _]) => saveTimelineVariables.includes(key)
        )
      );
    }
    return result;
  }
  /**
   * Runs a callback function retrieved from a parameter value and returns its result.
   *
   * @param parameterName The name of the parameter to retrieve the callback function from.
   * @param callbackParameters The parameters (if any) to be passed to the callback function
   */
  runParameterCallback(parameterName, ...callbackParameters) {
    const callback = this.getParameterValue(parameterName, { evaluateFunctions: false });
    if (callback) {
      return callback(...callbackParameters);
    }
  }
  onStart() {
    this.dependencies.onTrialStart(this);
    this.runParameterCallback("on_start", this.trialObject);
    this.dependencies.runOnStartExtensionCallbacks(this.getParameterValue("extensions"));
  }
  async onFinish() {
    const extensionResults = await this.dependencies.runOnFinishExtensionCallbacks(
      this.getParameterValue("extensions")
    );
    Object.assign(this.result, extensionResults);
    await Promise.resolve(this.runParameterCallback("on_finish", this.getResult()));
    this.dependencies.onTrialFinished(this);
  }
  evaluateTimelineVariable(variable) {
    return this.parent?.evaluateTimelineVariable(variable);
  }
  getParameterValue(parameterPath, options = {}) {
    if (timelineDescriptionKeys.includes(
      typeof parameterPath === "string" ? parameterPath : parameterPath[0]
    )) {
      options.recursive = false;
    }
    return super.getParameterValue(parameterPath, options);
  }
  /**
   * Retrieves and evaluates the `simulation_options` parameter, considering nested properties and
   * global simulation options.
   */
  getSimulationOptions() {
    const simulationOptions = this.getParameterValue("simulation_options", {
      replaceResult: (result = {}) => {
        if (typeof result === "string") {
          const globalSimulationOptions = this.dependencies.getGlobalSimulationOptions();
          result = globalSimulationOptions[result] ?? globalSimulationOptions["default"] ?? {};
        }
        return deepMerge(
          deepCopy(this.dependencies.getGlobalSimulationOptions().default),
          deepCopy(result)
        );
      }
    });
    if (typeof simulationOptions === "undefined") {
      return {};
    }
    simulationOptions.mode = this.getParameterValue(["simulation_options", "mode"]);
    simulationOptions.simulate = this.getParameterValue(["simulation_options", "simulate"]);
    simulationOptions.data = this.getParameterValue(["simulation_options", "data"]);
    if (typeof simulationOptions.data === "object") {
      simulationOptions.data = Object.fromEntries(
        Object.keys(simulationOptions.data).map((key) => [
          key,
          this.getParameterValue(["simulation_options", "data", key])
        ])
      );
    }
    return simulationOptions;
  }
  /**
   * Returns the result object of this trial or `undefined` if the result is not yet known or the
   * `record_data` trial parameter is `false`.
   */
  getResult() {
    return this.getParameterValue("record_data") === false ? void 0 : this.result;
  }
  getResults() {
    const result = this.getResult();
    return result ? [result] : [];
  }
  /**
   * Checks that the parameters provided in the trial description align with the plugin's info
   * object, resolves missing parameter values from the parent timeline, resolves timeline variable
   * parameters, evaluates parameter functions if the expected parameter type is not `FUNCTION`, and
   * sets default values for optional parameters.
   */
  processParameters() {
    const assignParameterValues = (parameterObject, parameterInfos, parentParameterPath = []) => {
      for (const [parameterName, parameterConfig] of Object.entries(parameterInfos)) {
        const parameterPath = [...parentParameterPath, parameterName];
        let parameterValue = this.getParameterValue(parameterPath, {
          evaluateFunctions: parameterConfig.type !== ParameterType.FUNCTION,
          replaceResult: (originalResult) => {
            if (typeof originalResult === "undefined") {
              if (typeof parameterConfig.default === "undefined") {
                throw new Error(
                  `You must specify a value for the "${parameterPathArrayToString(
                    parameterPath
                  )}" parameter in the "${this.pluginInfo.name}" plugin.`
                );
              } else {
                return parameterConfig.default;
              }
            } else {
              return originalResult;
            }
          }
        });
        if (parameterConfig.array && !Array.isArray(parameterValue)) {
          const parameterPathString = parameterPathArrayToString(parameterPath);
          throw new Error(
            `A non-array value (\`${parameterValue}\`) was provided for the array parameter "${parameterPathString}" in the "${this.pluginInfo.name}" plugin. Please make sure that "${parameterPathString}" is an array.`
          );
        }
        if (parameterConfig.type === ParameterType.COMPLEX && parameterConfig.nested) {
          if (parameterConfig.array) {
            parameterValue = parameterValue.map((_, arrayIndex) => {
              const arrayElementPath = [...parameterPath, arrayIndex.toString()];
              const arrayElementValue = this.getParameterValue(arrayElementPath);
              assignParameterValues(arrayElementValue, parameterConfig.nested, arrayElementPath);
              return arrayElementValue;
            });
          } else {
            assignParameterValues(parameterValue, parameterConfig.nested, parameterPath);
          }
        }
        parameterObject[parameterName] = parameterValue;
      }
    };
    const trialObject = deepCopy(this.description);
    assignParameterValues(trialObject, this.pluginInfo.parameters);
    this.trialObject = trialObject;
  }
  getLatestNode() {
    return this;
  }
  getActiveTimelineByName(name) {
    return void 0;
  }
}

class Timeline extends TimelineNode {
  constructor(dependencies, description, parent) {
    super(dependencies);
    this.parent = parent;
    this.children = [];
    this.shouldAbort = false;
    this.resumePromise = new PromiseWrapper();
    this.description = Array.isArray(description) ? { timeline: description } : description;
    this.initializeParameterValueCache();
  }
  async run() {
    if (typeof this.index === "undefined") {
      this.index = 0;
    }
    this.status = TimelineNodeStatus.RUNNING;
    const { conditional_function, loop_function, repetitions = 1 } = this.description;
    let timelineVariableOrder = this.generateTimelineVariableOrder();
    this.setCurrentTimelineVariablesByIndex(timelineVariableOrder[0]);
    let isInitialTimelineVariableOrder = true;
    let currentLoopIterationResults;
    if (!conditional_function || conditional_function()) {
      this.onStart();
      for (let repetition = 0; repetition < repetitions; repetition++) {
        do {
          currentLoopIterationResults = [];
          if (isInitialTimelineVariableOrder) {
            isInitialTimelineVariableOrder = false;
          } else {
            timelineVariableOrder = this.generateTimelineVariableOrder();
          }
          for (const timelineVariableIndex of timelineVariableOrder) {
            this.setCurrentTimelineVariablesByIndex(timelineVariableIndex);
            for (const childNodeDescription of this.description.timeline) {
              const childNode = this.instantiateChildNode(childNodeDescription);
              const previousChild = this.currentChild;
              this.currentChild = childNode;
              childNode.index = previousChild ? previousChild.getLatestNode().index + 1 : this.index;
              await childNode.run();
              if (this.status === TimelineNodeStatus.PAUSED) {
                await this.resumePromise.get();
              }
              if (this.shouldAbort) {
                this.status = TimelineNodeStatus.ABORTED;
                return;
              }
              currentLoopIterationResults.push(...this.currentChild.getResults());
            }
          }
        } while (loop_function && loop_function(new DataCollection(currentLoopIterationResults)));
      }
      this.onFinish();
    }
    this.status = TimelineNodeStatus.COMPLETED;
  }
  onStart() {
    if (this.description.on_timeline_start) {
      this.description.on_timeline_start();
    }
  }
  onFinish() {
    if (this.description.on_timeline_finish) {
      this.description.on_timeline_finish();
    }
  }
  pause() {
    if (this.currentChild instanceof Timeline) {
      this.currentChild.pause();
    }
    this.status = TimelineNodeStatus.PAUSED;
  }
  resume() {
    if (this.status == TimelineNodeStatus.PAUSED) {
      if (this.currentChild instanceof Timeline) {
        this.currentChild.resume();
      }
      this.status = TimelineNodeStatus.RUNNING;
      this.resumePromise.resolve();
    }
  }
  /**
   * If the timeline is running or paused, aborts the timeline after the current trial has completed
   */
  abort() {
    if (this.status === TimelineNodeStatus.RUNNING || this.status === TimelineNodeStatus.PAUSED) {
      if (this.currentChild instanceof Timeline) {
        this.currentChild.abort();
      }
      this.shouldAbort = true;
      if (this.status === TimelineNodeStatus.PAUSED) {
        this.resume();
      }
    }
  }
  instantiateChildNode(childDescription) {
    const newChildNode = isTimelineDescription(childDescription) ? new Timeline(this.dependencies, childDescription, this) : new Trial(this.dependencies, childDescription, this);
    this.children.push(newChildNode);
    return newChildNode;
  }
  setCurrentTimelineVariablesByIndex(index) {
    this.currentTimelineVariables = {
      ...this.parent?.getAllTimelineVariables(),
      ...index === null ? void 0 : this.description.timeline_variables[index]
    };
  }
  /**
   * If the timeline has timeline variables, returns the order of `timeline_variables` array indices
   * to be used, according to the timeline's `sample` setting. If the timeline has no timeline
   * variables, returns `[null]`.
   */
  generateTimelineVariableOrder() {
    const timelineVariableLength = this.description.timeline_variables?.length;
    if (!timelineVariableLength) {
      return [null];
    }
    let order = [...Array(timelineVariableLength).keys()];
    const sample = this.description.sample;
    if (sample) {
      switch (sample.type) {
        case "custom":
          order = sample.fn(order);
          break;
        case "with-replacement":
          order = sampleWithReplacement(order, sample.size, sample.weights);
          break;
        case "without-replacement":
          order = sampleWithoutReplacement(order, sample.size);
          break;
        case "fixed-repetitions":
          order = repeat(order, sample.size);
          break;
        case "alternate-groups":
          order = shuffleAlternateGroups(sample.groups, sample.randomize_group_order);
          break;
        default:
          throw new Error(
            `Invalid type "${// @ts-expect-error TS doesn't have a type for `sample` in this case
            sample.type}" in timeline sample parameters. Valid options for type are "custom", "with-replacement", "without-replacement", "fixed-repetitions", and "alternate-groups"`
          );
      }
    }
    if (this.description.randomize_order) {
      order = shuffle(order);
    }
    return order;
  }
  /**
   * Returns the current values of all timeline variables, including those from parent timelines
   */
  getAllTimelineVariables() {
    return this.currentTimelineVariables;
  }
  evaluateTimelineVariable(variable) {
    if (this.currentTimelineVariables?.hasOwnProperty(variable.name)) {
      return this.currentTimelineVariables[variable.name];
    }
    throw new Error(`Timeline variable ${variable.name} not found.`);
  }
  getResults() {
    const results = [];
    for (const child of this.children) {
      if (child instanceof Trial) {
        const childResult = child.getResult();
        if (childResult) {
          results.push(childResult);
        }
      } else if (child instanceof Timeline) {
        results.push(...child.getResults());
      }
    }
    return results;
  }
  /**
   * Returns the naive progress of the timeline (as a fraction), without considering conditional or
   * loop functions.
   */
  getNaiveProgress() {
    if (this.status === TimelineNodeStatus.PENDING) {
      return 0;
    }
    const activeNode = this.getLatestNode();
    if (!activeNode) {
      return 1;
    }
    let completedTrials = activeNode.index;
    if (activeNode.getStatus() === TimelineNodeStatus.COMPLETED) {
      completedTrials++;
    }
    return Math.min(completedTrials / this.getNaiveTrialCount(), 1);
  }
  /**
   * Recursively computes the naive number of trials in the timeline, without considering
   * conditional or loop functions.
   */
  getNaiveTrialCount() {
    const getTrialCount = (description) => {
      const getTimelineArrayTrialCount = (description2) => description2.map((childDescription) => getTrialCount(childDescription)).reduce((a, b) => a + b);
      if (Array.isArray(description)) {
        return getTimelineArrayTrialCount(description);
      }
      if (isTrialDescription(description)) {
        return 1;
      }
      if (isTimelineDescription(description)) {
        let conditionCount = description.timeline_variables?.length || 1;
        switch (description.sample?.type) {
          case "with-replacement":
          case "without-replacement":
            conditionCount = description.sample.size;
            break;
          case "fixed-repetitions":
            conditionCount *= description.sample.size;
            break;
          case "alternate-groups":
            conditionCount = description.sample.groups.map((group) => group.length).reduce((a, b) => a + b, 0);
            break;
        }
        return getTimelineArrayTrialCount(description.timeline) * (description.repetitions ?? 1) * conditionCount;
      }
      return 0;
    };
    return getTrialCount(this.description);
  }
  getLatestNode() {
    return this.currentChild?.getLatestNode() ?? this;
  }
  getActiveTimelineByName(name) {
    if (this.description.name === name) {
      return this;
    }
    return this.currentChild?.getActiveTimelineByName(name);
  }
}

class JsPsych {
  constructor(options) {
    this.turk = turk;
    this.randomization = randomization;
    this.utils = utils;
    /** Options */
    this.options = {};
    /**
     * Whether the page is retrieved directly via the `file://` protocol (true) or hosted on a web
     * server (false)
     */
    this.isFileProtocolUsed = false;
    this.finishTrialPromise = new PromiseWrapper();
    this.timelineDependencies = {
      onTrialStart: (trial) => {
        this.options.on_trial_start(trial.trialObject);
        this.getDisplayContainerElement().focus();
        this.getDisplayElement().scrollTop = 0;
      },
      onTrialResultAvailable: (trial) => {
        const result = trial.getResult();
        if (result) {
          result.time_elapsed = this.getTotalTime();
          this.data.write(trial);
        }
      },
      onTrialFinished: (trial) => {
        const result = trial.getResult();
        this.options.on_trial_finish(result);
        if (result) {
          this.options.on_data_update(result);
        }
        if (this.progressBar && this.options.auto_update_progress_bar) {
          this.progressBar.progress = this.timeline.getNaiveProgress();
        }
      },
      runOnStartExtensionCallbacks: (extensionsConfiguration) => this.extensionManager.onStart(extensionsConfiguration),
      runOnLoadExtensionCallbacks: (extensionsConfiguration) => this.extensionManager.onLoad(extensionsConfiguration),
      runOnFinishExtensionCallbacks: (extensionsConfiguration) => this.extensionManager.onFinish(extensionsConfiguration),
      getSimulationMode: () => this.simulationMode,
      getGlobalSimulationOptions: () => this.simulationOptions,
      instantiatePlugin: (pluginClass) => new pluginClass(this),
      getDisplayElement: () => this.getDisplayElement(),
      getDefaultIti: () => this.getInitSettings().default_iti,
      finishTrialPromise: this.finishTrialPromise,
      clearAllTimeouts: () => this.pluginAPI.clearAllTimeouts()
    };
    this.extensionManagerDependencies = {
      instantiateExtension: (extensionClass) => new extensionClass(this)
    };
    this.dataDependencies = {
      getProgress: () => ({
        time: this.getTotalTime(),
        trial: this.timeline?.getLatestNode().index ?? 0
      }),
      onInteractionRecordAdded: (record) => {
        this.options.on_interaction_data_update(record);
      },
      getDisplayElement: () => this.getDisplayElement()
    };
    options = {
      display_element: void 0,
      on_finish: () => {
      },
      on_trial_start: () => {
      },
      on_trial_finish: () => {
      },
      on_data_update: () => {
      },
      on_interaction_data_update: () => {
      },
      on_close: () => {
      },
      use_webaudio: true,
      show_progress_bar: false,
      message_progress_bar: "Completion Progress",
      auto_update_progress_bar: true,
      default_iti: 0,
      minimum_valid_rt: 0,
      experiment_width: null,
      override_safe_mode: false,
      case_sensitive_responses: false,
      extensions: [],
      ...options
    };
    this.options = options;
    autoBind(this);
    if (window.location.protocol == "file:" && (options.override_safe_mode === false || typeof options.override_safe_mode === "undefined")) {
      options.use_webaudio = false;
      this.isFileProtocolUsed = true;
      console.warn(
        "jsPsych detected that it is running via the file:// protocol and not on a web server. To prevent issues with cross-origin requests, Web Audio and video preloading have been disabled. If you would like to override this setting, you can set 'override_safe_mode' to 'true' in initJsPsych. For more information, see: https://www.jspsych.org/overview/running-experiments"
      );
    }
    this.data = new JsPsychData(this.dataDependencies);
    this.pluginAPI = createJointPluginAPIObject(this);
    this.extensionManager = new ExtensionManager(
      this.extensionManagerDependencies,
      options.extensions
    );
  }
  version() {
    return version;
  }
  /**
   * Starts an experiment using the provided timeline and returns a promise that is resolved when
   * the experiment is finished.
   *
   * @param timeline The timeline to be run
   */
  async run(timeline) {
    if (typeof timeline === "undefined") {
      console.error("No timeline declared in jsPsych.run(). Cannot start experiment.");
    }
    if (timeline.length === 0) {
      console.error(
        "No trials have been added to the timeline (the timeline is an empty array). Cannot start experiment."
      );
    }
    this.timeline = new Timeline(this.timelineDependencies, timeline);
    await this.prepareDom();
    await this.extensionManager.initializeExtensions();
    document.documentElement.setAttribute("jspsych", "present");
    this.experimentStartTime = /* @__PURE__ */ new Date();
    await this.timeline.run();
    await Promise.resolve(this.options.on_finish(this.data.get()));
    if (this.endMessage) {
      this.getDisplayElement().innerHTML = this.endMessage;
    }
    this.data.removeInteractionListeners();
  }
  async simulate(timeline, simulation_mode = "data-only", simulation_options = {}) {
    this.simulationMode = simulation_mode;
    this.simulationOptions = simulation_options;
    await this.run(timeline);
  }
  getProgress() {
    return {
      total_trials: this.timeline?.getNaiveTrialCount(),
      current_trial_global: this.timeline?.getLatestNode().index ?? 0,
      percent_complete: this.timeline?.getNaiveProgress() * 100
    };
  }
  getStartTime() {
    return this.experimentStartTime;
  }
  getTotalTime() {
    if (!this.experimentStartTime) {
      return 0;
    }
    return (/* @__PURE__ */ new Date()).getTime() - this.experimentStartTime.getTime();
  }
  getDisplayElement() {
    return this.displayElement;
  }
  getDisplayContainerElement() {
    return this.displayContainerElement;
  }
  abortExperiment(endMessage, data = {}) {
    this.endMessage = endMessage;
    this.timeline.abort();
    this.pluginAPI.cancelAllKeyboardResponses();
    this.pluginAPI.clearAllTimeouts();
    this.finishTrial(data);
  }
  abortCurrentTimeline() {
    let currentTimeline = this.timeline?.getLatestNode();
    if (currentTimeline instanceof Trial) {
      currentTimeline = currentTimeline.parent;
    }
    if (currentTimeline instanceof Timeline) {
      currentTimeline.abort();
    }
  }
  /**
   * Aborts a named timeline. The timeline must be currently running in order to abort it.
   *
   * @param name The name of the timeline to abort. Timelines can be given names by setting the `name` parameter in the description of the timeline.
   */
  abortTimelineByName(name) {
    const timeline = this.timeline?.getActiveTimelineByName(name);
    if (timeline) {
      timeline.abort();
    }
  }
  getCurrentTrial() {
    const activeNode = this.timeline?.getLatestNode();
    if (activeNode instanceof Trial) {
      return activeNode.description;
    }
    return void 0;
  }
  getInitSettings() {
    return this.options;
  }
  timelineVariable(variableName) {
    return new TimelineVariable(variableName);
  }
  evaluateTimelineVariable(variableName) {
    return this.timeline?.getLatestNode()?.evaluateTimelineVariable(new TimelineVariable(variableName));
  }
  pauseExperiment() {
    this.timeline?.pause();
  }
  resumeExperiment() {
    this.timeline?.resume();
  }
  getSafeModeStatus() {
    return this.isFileProtocolUsed;
  }
  getTimeline() {
    return this.timeline?.description.timeline;
  }
  get extensions() {
    return this.extensionManager?.extensions ?? {};
  }
  async prepareDom() {
    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        window.addEventListener("load", resolve);
      });
    }
    const options = this.options;
    if (typeof options.display_element === "undefined") {
      let body = document.body;
      if (!body) {
        body = document.createElement("body");
        document.documentElement.appendChild(body);
      }
      document.querySelector("html").style.height = "100%";
      body.style.margin = "0px";
      body.style.height = "100%";
      body.style.width = "100%";
      options.display_element = body;
    } else {
      const display = options.display_element instanceof Element ? options.display_element : document.querySelector("#" + options.display_element);
      if (display === null) {
        console.error("The display_element specified in initJsPsych() does not exist in the DOM.");
      } else {
        options.display_element = display;
      }
    }
    const contentElement = document.createElement("div");
    contentElement.id = "jspsych-content";
    const contentWrapperElement = document.createElement("div");
    contentWrapperElement.className = "jspsych-content-wrapper";
    contentWrapperElement.appendChild(contentElement);
    this.displayContainerElement = options.display_element;
    this.displayContainerElement.appendChild(contentWrapperElement);
    this.displayElement = contentElement;
    if (options.experiment_width !== null) {
      this.displayElement.style.width = options.experiment_width + "px";
    }
    options.display_element.tabIndex = 0;
    this.displayContainerElement.classList.add("jspsych-display-element");
    this.displayElement.classList.add("jspsych-content");
    this.data.createInteractionListeners();
    window.addEventListener("beforeunload", options.on_close);
    if (this.options.show_progress_bar) {
      const progressBarContainer = document.createElement("div");
      progressBarContainer.id = "jspsych-progressbar-container";
      this.progressBar = new ProgressBar(progressBarContainer, this.options.message_progress_bar);
      this.getDisplayContainerElement().insertAdjacentElement("afterbegin", progressBarContainer);
    }
  }
  finishTrial(data) {
    this.finishTrialPromise.resolve(data);
  }
}

class MigrationError extends Error {
  constructor(message = "The global `jsPsych` variable is no longer available in jsPsych v7.") {
    super(
      `${message} Please follow the migration guide at https://www.jspsych.org/7.0/support/migration-v7/ to update your experiment.`
    );
    this.name = "MigrationError";
  }
}
window.jsPsych = {
  get init() {
    throw new MigrationError("`jsPsych.init()` was replaced by `initJsPsych()` in jsPsych v7.");
  },
  get data() {
    throw new MigrationError();
  },
  get randomization() {
    throw new MigrationError();
  },
  get turk() {
    throw new MigrationError();
  },
  get pluginAPI() {
    throw new MigrationError();
  },
  get ALL_KEYS() {
    throw new MigrationError(
      'jsPsych.ALL_KEYS was replaced by the "ALL_KEYS" string in jsPsych v7.'
    );
  },
  get NO_KEYS() {
    throw new MigrationError('jsPsych.NO_KEYS was replaced by the "NO_KEYS" string in jsPsych v7.');
  }
};

if (typeof window !== "undefined" && window.hasOwnProperty("webkitAudioContext") && !window.hasOwnProperty("AudioContext")) {
  window.AudioContext = webkitAudioContext;
}
function initJsPsych(options) {
  const jsPsych = new JsPsych(options);
  const migrationMessages = {
    init: "`jsPsych.init()` was replaced by `initJsPsych()` in jsPsych v7.",
    ALL_KEYS: 'jsPsych.ALL_KEYS was replaced by the "ALL_KEYS" string in jsPsych v7.',
    NO_KEYS: 'jsPsych.NO_KEYS was replaced by the "NO_KEYS" string in jsPsych v7.',
    // Getter functions that were renamed
    currentTimelineNodeID: "`currentTimelineNodeID()` was renamed to `getCurrentTimelineNodeID()` in jsPsych v7.",
    progress: "`progress()` was renamed to `getProgress()` in jsPsych v7.",
    startTime: "`startTime()` was renamed to `getStartTime()` in jsPsych v7.",
    totalTime: "`totalTime()` was renamed to `getTotalTime()` in jsPsych v7.",
    currentTrial: "`currentTrial()` was renamed to `getCurrentTrial()` in jsPsych v7.",
    initSettings: "`initSettings()` was renamed to `getInitSettings()` in jsPsych v7.",
    allTimelineVariables: "`allTimelineVariables()` was renamed to `getAllTimelineVariables()` in jsPsych v7."
  };
  Object.defineProperties(
    jsPsych,
    Object.fromEntries(
      Object.entries(migrationMessages).map(([key, message]) => [
        key,
        {
          get() {
            throw new MigrationError(message);
          }
        }
      ])
    )
  );
  return jsPsych;
}

export { DataCollection, JsPsych, ParameterType, initJsPsych };
//# sourceMappingURL=index.js.map
