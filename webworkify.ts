import { walk } from "estree-walker";
import type { SequenceExpression } from 'estree';

type WorkerId = string;
type DepId = string;

export default function webworkify() {
  const workerIds: Set<WorkerId> = new Set();
  const workerIndexes: Record<WorkerId, number> = {};
  let workerIndex = 0;
  const depIds: Record<DepId, WorkerId> = {};

  let serializableIndex = 0;

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
          const { moduleId, code } = makeSerializable(renderModule.code, this.parse(renderModule.code));
          workerDeps.push(`${moduleId}.toString() + ";" + ${moduleId}.name + "();"`);
          output.push(code);
        } else if (workerIds.has(id)) {
          const [workerEntry, workerCall] = renderModule.code.split('/**SEPARATOR*/');
          const moduleId = `webworkified${serializableIndex}`;
          serializableIndex += 1;

          output.push(`function ${moduleId}(){ ${workerEntry} }`);
          workerDeps.push(`${moduleId}.toString() + ";" + ${moduleId}.name + "();"`);
          output.push(workerCall.replace('CONTENT', '"__WEBWORKIFY_VARS__"+' + workerDeps.join('+')));
        } else {
          output.push(renderModule.code);
        }
      }

      return output.join('\n');
    },

    generateBundle (options, bundle) {
      for (const id in bundle) {
        const item = bundle[id];
        if (item.code) {
          const vars: string[] = [];
          item.code = item.code.replace(/__WEBWORKIFY_VARS_START__;var (.*?);__WEBWORKIFY_VARS_END__;/g, (_match, p1: string) => {
            vars.push(p1);
            return 'var ' + p1 + ';';
          });
          item.code = item.code.replace(/"__WEBWORKIFY_VARS__"\+/g, vars.length > 0 ? `"var ${vars.join(',')};" + ` : '');
        }
      }
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

  function makeSerializable2(ast: any) {
    const moduleId = `webworkified${serializableIndex}`;
    const topLevels: string[] = [];
    walk(ast, {
      enter(node, parent, prop, index) {
        if (parent === ast) {
          if (node.type === 'FunctionDeclaration') {
            const id = node.id;
            topLevels.push(id.name);
            this.replace({
              type: 'AssignmentExpression',
              left: id,
              operator: '=',
              right: {
                type: 'FunctionExpression',
                params: node.params,
                body: node.body
              }
            });
          }
          if (node.type === 'VariableDeclaration') {
            const seq: SequenceExpression = {
              type: 'SequenceExpression',
              expressions: []
            };
            for (const decl of node.declarations) {
              if (decl.id.type === 'Identifier') {
                topLevels.push(decl.id.name);
                if (decl.init) {
                  seq.expressions.push({
                    type: 'AssignmentExpression',
                    left: decl.id,
                    operator: '=',
                    right: decl.init
                  });
                }
              }
            }
            this.replace(seq);
          }
        }
      },
    });
    console.log('topLevels', topLevels);
  }

  function makeSerializable(code: string, ast: any) {
    makeSerializable2(ast);
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
    const extvarsCode = extvars.length > 0 ? `__WEBWORKIFY_VARS_START__;var ${extvars.join(',')};__WEBWORKIFY_VARS_END__;` : '';
    return { moduleId, extvars, code: extvarsCode + `function ${moduleId}(){ ${code} }\n${moduleId}();\n` };
  }
}

