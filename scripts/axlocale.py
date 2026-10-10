"""AX — pose des clés dans les trois fichiers de langue, en gardant l'ordre et la forme."""
import json, collections, sys
ROOT='/Users/clyoapple/Desktop/CLAUDE PROJECT/LO YANOUM/src/locales/'
def put(lang, dotted, value):
    p=ROOT+lang+'.json'
    raw=open(p).read()
    d=json.loads(raw,object_pairs_hook=collections.OrderedDict)
    cur=d
    parts=dotted.split('.')
    for k in parts[:-1]:
        if k not in cur or not isinstance(cur[k],dict): cur[k]=collections.OrderedDict()
        cur=cur[k]
    cur[parts[-1]]=value
    open(p,'w').write(json.dumps(d,ensure_ascii=False,indent=2)+('\n' if raw.endswith('\n') else ''))
if __name__=='__main__':
    data=json.load(open(sys.argv[1]),object_pairs_hook=collections.OrderedDict)
    for lang,kv in data.items():
        for k,v in kv.items(): put(lang,k,v)
