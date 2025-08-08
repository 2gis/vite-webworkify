

type WorkerId = string;
type DepId = string;

export default function webworkify() {
  const workerIds: Set<WorkerId> = new Set();
  const workerIndexes: Record<WorkerId, number> = {};
  let workerIndex = 0;
  const depIds: Record<DepId, WorkerId> = {};

  return {
    name: 'transform-file',

    transform(src: string, id: string) {
      if (id.endsWith('?webworkify')) {
        workerIds.add(id);
        const index = workerIndex++;
        workerIndexes[id] = index;

        return `${src}/**SEPARATOR*/export default function () { const blob = new Blob([CONTENT], { type: "application/javascript" }); return new Worker(URL.createObjectURL(blob)); }`;
      }
    },

    renderChunk(code, renderChunk, options, meta) {
      const output: string[] = [];
      const workerDeps: string[] = [];
      for (const id in renderChunk.modules) {
        const renderModule = renderChunk.modules[id];
        if (depIds[id]) {
          const { moduleId, extvars, code } = makeSerializable(renderModule.code);
          if (extvars.length > 0) {
            workerDeps.push(`"${extvars.map(v => `${v}=undefined`).join(', ')};"`);
          }
          workerDeps.push(`${moduleId}.toString() + ";" + ${moduleId}.name + "(self);"`);
          output.push(code);
        } else if (workerIds.has(id)) {
          const [workerEntry, workerCall] = renderModule.code.split('/**SEPARATOR*/');
          workerDeps.push(JSON.stringify(';'+workerEntry));
          output.push(workerCall.replace('CONTENT', workerDeps.join('+')));
        } else {
          output.push(renderModule.code);
        }
      }

      return output.join('\n');
    },

    buildEnd() {
      const analyzeDependencies = (moduleId: string, workerId: WorkerId, visited = new Set()) => {
        if (visited.has(moduleId)) return [];
        visited.add(moduleId);
        
        const moduleInfo = this.getModuleInfo(moduleId);
        
        if (moduleInfo) {
          depIds[moduleId] = workerId;
          for (const dep of moduleInfo.importedIds) {
            analyzeDependencies(dep, workerId, visited);
          }
        }
      };

      for (const workerId of workerIds) {
        const workerInfo = this.getModuleInfo(workerId);
        if (workerInfo) {
          for (const dep of workerInfo.importedIds) {
            analyzeDependencies(dep, workerId);
          }
        }
      }
    }
  }
}

let serializableIndex = 0;
function makeSerializable(code: string) {
  const moduleId = `webworkified${serializableIndex}`;
  const extvars: string[] = [];
  serializableIndex += 1;
  code = ('\n'+code)
    // (const|var|let) foo -> foo;
    .replace(/\n(var|const|let)\s+([\w\d_\$]+)/mg, (_m, _spec, name) => {
      extvars.push(name);
      return `\n${name}`;
    })
    // function foo -> foo = function;
    .replace(/\nfunction\s+([\w\d_\$]+)/mg, (_m, name) => {
      extvars.push(name);
      return `\n${name} = function `;
    });
  const extvarsCode = extvars.length > 0 ? `${extvars.map(v => `self.${v}=undefined`).join(', ')};` : '';
  return { moduleId, extvars, code: extvarsCode + `function ${moduleId}(){ ${code} }\n${moduleId}();\n` };
}