var i=globalThis,a=i.ShadowRoot&&(i.ShadyCSS===void 0||i.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,t=Symbol(),FZ=new WeakMap;class e{constructor(Z,$,X){if(this._$cssResult$=!0,X!==t)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=Z,this._strings=$}get styleSheet(){let Z=this._styleSheet,$=this._strings;if(a&&Z===void 0){let X=$!==void 0&&$.length===1;if(X)Z=FZ.get($);if(Z===void 0){if((this._styleSheet=Z=new CSSStyleSheet).replaceSync(this.cssText),X)FZ.set($,Z)}}return Z}toString(){return this.cssText}}var oZ=(Z)=>{if(Z._$cssResult$===!0)return Z.cssText;else if(typeof Z==="number")return Z;else throw Error(`Value passed to 'css' function must be a 'css' function result: ${Z}. Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.`)},sZ=(Z)=>new e(typeof Z==="string"?Z:String(Z),void 0,t),WZ=(Z,...$)=>{let X=Z.length===1?Z[0]:$.reduce((K,Y,Q)=>K+oZ(Y)+Z[Q+1],Z[0]);return new e(X,Z,t)},UZ=(Z,$)=>{if(a)Z.adoptedStyleSheets=$.map((X)=>X instanceof CSSStyleSheet?X:X.styleSheet);else for(let X of $){let K=document.createElement("style"),Y=i.litNonce;if(Y!==void 0)K.setAttribute("nonce",Y);K.textContent=X.cssText,Z.appendChild(K)}},lZ=(Z)=>{let $="";for(let X of Z.cssRules)$+=X.cssText;return sZ($)},ZZ=a?(Z)=>Z:(Z)=>Z instanceof CSSStyleSheet?lZ(Z):Z;var{is:rZ,defineProperty:nZ,getOwnPropertyDescriptor:OZ,getOwnPropertyNames:aZ,getOwnPropertySymbols:tZ,getPrototypeOf:MZ}=Object,eZ=!1,U=globalThis;if(eZ)U.customElements??=customElements;var O=!0,k,_Z=U.trustedTypes,Z0=_Z?_Z.emptyScript:"",fZ=O?U.reactiveElementPolyfillSupportDevMode:U.reactiveElementPolyfillSupport;if(O)U.litIssuedWarnings??=new Set,k=(Z,$)=>{if($+=` See https://lit.dev/msg/${Z} for more information.`,!U.litIssuedWarnings.has($)&&!U.litIssuedWarnings.has(Z))console.warn($),U.litIssuedWarnings.add($)},queueMicrotask(()=>{if(k("dev-mode","Lit is in dev mode. Not recommended for production!"),U.ShadyDOM?.inUse&&fZ===void 0)k("polyfill-support-missing","Shadow DOM is being polyfilled via `ShadyDOM` but the `polyfill-support` module has not been loaded.")});var $0=O?(Z)=>{if(!U.emitLitDebugLogEvents)return;U.dispatchEvent(new CustomEvent("lit-debug",{detail:Z}))}:void 0,b=(Z,$)=>Z,$Z={toAttribute(Z,$){switch($){case Boolean:Z=Z?Z0:null;break;case Object:case Array:Z=Z==null?Z:JSON.stringify(Z);break}return Z},fromAttribute(Z,$){let X=Z;switch($){case Boolean:X=Z!==null;break;case Number:X=Z===null?null:Number(Z);break;case Object:case Array:try{X=JSON.parse(Z)}catch(K){X=null}break}return X}},AZ=(Z,$)=>!rZ(Z,$),kZ={attribute:!0,type:String,converter:$Z,reflect:!1,useDefault:!1,hasChanged:AZ};Symbol.metadata??=Symbol("metadata");U.litPropertyMetadata??=new WeakMap;class M extends HTMLElement{static addInitializer(Z){this.__prepare(),(this._initializers??=[]).push(Z)}static get observedAttributes(){return this.finalize(),this.__attributeToPropertyMap&&[...this.__attributeToPropertyMap.keys()]}static createProperty(Z,$=kZ){if($.state)$.attribute=!1;if(this.__prepare(),this.prototype.hasOwnProperty(Z))$=Object.create($),$.wrapped=!0;if(this.elementProperties.set(Z,$),!$.noAccessor){let X=O?Symbol.for(`${String(Z)} (@property() cache)`):Symbol(),K=this.getPropertyDescriptor(Z,X,$);if(K!==void 0)nZ(this.prototype,Z,K)}}static getPropertyDescriptor(Z,$,X){let{get:K,set:Y}=OZ(this.prototype,Z)??{get(){return this[$]},set(Q){this[$]=Q}};if(O&&K==null){if("value"in(OZ(this.prototype,Z)??{}))throw Error(`Field ${JSON.stringify(String(Z))} on ${this.name} was declared as a reactive property but it's actually declared as a value on the prototype. Usually this is due to using @property or @state on a method.`);k("reactive-property-without-getter",`Field ${JSON.stringify(String(Z))} on ${this.name} was declared as a reactive property but it does not have a getter. This will be an error in a future version of Lit.`)}return{get:K,set(Q){let B=K?.call(this);Y?.call(this,Q),this.requestUpdate(Z,B,X)},configurable:!0,enumerable:!0}}static getPropertyOptions(Z){return this.elementProperties.get(Z)??kZ}static __prepare(){if(this.hasOwnProperty(b("elementProperties",this)))return;let Z=MZ(this);if(Z.finalize(),Z._initializers!==void 0)this._initializers=[...Z._initializers];this.elementProperties=new Map(Z.elementProperties)}static finalize(){if(this.hasOwnProperty(b("finalized",this)))return;if(this.finalized=!0,this.__prepare(),this.hasOwnProperty(b("properties",this))){let $=this.properties,X=[...aZ($),...tZ($)];for(let K of X)this.createProperty(K,$[K])}let Z=this[Symbol.metadata];if(Z!==null){let $=litPropertyMetadata.get(Z);if($!==void 0)for(let[X,K]of $)this.elementProperties.set(X,K)}this.__attributeToPropertyMap=new Map;for(let[$,X]of this.elementProperties){let K=this.__attributeNameForProperty($,X);if(K!==void 0)this.__attributeToPropertyMap.set(K,$)}if(this.elementStyles=this.finalizeStyles(this.styles),O){if(this.hasOwnProperty("createProperty"))k("no-override-create-property","Overriding ReactiveElement.createProperty() is deprecated. The override will not be called with standard decorators");if(this.hasOwnProperty("getPropertyDescriptor"))k("no-override-get-property-descriptor","Overriding ReactiveElement.getPropertyDescriptor() is deprecated. The override will not be called with standard decorators")}}static finalizeStyles(Z){let $=[];if(Array.isArray(Z)){let X=new Set(Z.flat(1/0).reverse());for(let K of X)$.unshift(ZZ(K))}else if(Z!==void 0)$.push(ZZ(Z));return $}static __attributeNameForProperty(Z,$){let X=$.attribute;return X===!1?void 0:typeof X==="string"?X:typeof Z==="string"?Z.toLowerCase():void 0}constructor(){super();this.__instanceProperties=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this.__reflectingProperty=null,this.__initialize()}__initialize(){this.__updatePromise=new Promise((Z)=>this.enableUpdating=Z),this._$changedProperties=new Map,this.__saveInstanceProperties(),this.requestUpdate(),this.constructor._initializers?.forEach((Z)=>Z(this))}addController(Z){if((this.__controllers??=new Set).add(Z),this.renderRoot!==void 0&&this.isConnected)Z.hostConnected?.()}removeController(Z){this.__controllers?.delete(Z)}__saveInstanceProperties(){let Z=new Map,$=this.constructor.elementProperties;for(let X of $.keys())if(this.hasOwnProperty(X))Z.set(X,this[X]),delete this[X];if(Z.size>0)this.__instanceProperties=Z}createRenderRoot(){let Z=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return UZ(Z,this.constructor.elementStyles),Z}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this.__controllers?.forEach((Z)=>Z.hostConnected?.())}enableUpdating(Z){}disconnectedCallback(){this.__controllers?.forEach((Z)=>Z.hostDisconnected?.())}attributeChangedCallback(Z,$,X){this._$attributeToProperty(Z,X)}__propertyToAttribute(Z,$){let K=this.constructor.elementProperties.get(Z),Y=this.constructor.__attributeNameForProperty(Z,K);if(Y!==void 0&&K.reflect===!0){let B=(K.converter?.toAttribute!==void 0?K.converter:$Z).toAttribute($,K.type);if(O&&this.constructor.enabledWarnings.includes("migration")&&B===void 0)k("undefined-attribute-value",`The attribute value for the ${Z} property is undefined on element ${this.localName}. The attribute will be removed, but in the previous version of \`ReactiveElement\`, the attribute would not have changed.`);if(this.__reflectingProperty=Z,B==null)this.removeAttribute(Y);else this.setAttribute(Y,B);this.__reflectingProperty=null}}_$attributeToProperty(Z,$){let X=this.constructor,K=X.__attributeToPropertyMap.get(Z);if(K!==void 0&&this.__reflectingProperty!==K){let Y=X.getPropertyOptions(K),Q=typeof Y.converter==="function"?{fromAttribute:Y.converter}:Y.converter?.fromAttribute!==void 0?Y.converter:$Z;this.__reflectingProperty=K;let B=Q.fromAttribute($,Y.type);this[K]=B??this.__defaultValues?.get(K)??B,this.__reflectingProperty=null}}requestUpdate(Z,$,X,K=!1,Y){if(Z!==void 0){if(O&&Z instanceof Event)k("","The requestUpdate() method was called with an Event as the property name. This is probably a mistake caused by binding this.requestUpdate as an event listener. Instead bind a function that will call it with no arguments: () => this.requestUpdate()");let Q=this.constructor;if(K===!1)Y=this[Z];if(X??=Q.getPropertyOptions(Z),(X.hasChanged??AZ)(Y,$)||X.useDefault&&X.reflect&&Y===this.__defaultValues?.get(Z)&&!this.hasAttribute(Q.__attributeNameForProperty(Z,X)))this._$changeProperty(Z,$,X);else return}if(this.isUpdatePending===!1)this.__updatePromise=this.__enqueueUpdate()}_$changeProperty(Z,$,{useDefault:X,reflect:K,wrapped:Y},Q){if(X&&!(this.__defaultValues??=new Map).has(Z)){if(this.__defaultValues.set(Z,Q??$??this[Z]),Y!==!0||Q!==void 0)return}if(!this._$changedProperties.has(Z)){if(!this.hasUpdated&&!X)$=void 0;this._$changedProperties.set(Z,$)}if(K===!0&&this.__reflectingProperty!==Z)(this.__reflectingProperties??=new Set).add(Z)}async __enqueueUpdate(){this.isUpdatePending=!0;try{await this.__updatePromise}catch($){Promise.reject($)}let Z=this.scheduleUpdate();if(Z!=null)await Z;return!this.isUpdatePending}scheduleUpdate(){let Z=this.performUpdate();if(O&&this.constructor.enabledWarnings.includes("async-perform-update")&&typeof Z?.then==="function")k("async-perform-update",`Element ${this.localName} returned a Promise from performUpdate(). This behavior is deprecated and will be removed in a future version of ReactiveElement.`);return Z}performUpdate(){if(!this.isUpdatePending)return;if($0?.({kind:"update"}),!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),O){let Y=[...this.constructor.elementProperties.keys()].filter((Q)=>this.hasOwnProperty(Q)&&(Q in MZ(this)));if(Y.length)throw Error(`The following properties on element ${this.localName} will not trigger updates as expected because they are set using class fields: ${Y.join(", ")}. Native class fields and some compiled output will overwrite accessors used for detecting changes. See https://lit.dev/msg/class-field-shadowing for more information.`)}if(this.__instanceProperties){for(let[K,Y]of this.__instanceProperties)this[K]=Y;this.__instanceProperties=void 0}let X=this.constructor.elementProperties;if(X.size>0)for(let[K,Y]of X){let{wrapped:Q}=Y,B=this[K];if(Q===!0&&!this._$changedProperties.has(K)&&B!==void 0)this._$changeProperty(K,void 0,Y,B)}}let Z=!1,$=this._$changedProperties;try{if(Z=this.shouldUpdate($),Z)this.willUpdate($),this.__controllers?.forEach((X)=>X.hostUpdate?.()),this.update($);else this.__markUpdated()}catch(X){throw Z=!1,this.__markUpdated(),X}if(Z)this._$didUpdate($)}willUpdate(Z){}_$didUpdate(Z){if(this.__controllers?.forEach(($)=>$.hostUpdated?.()),!this.hasUpdated)this.hasUpdated=!0,this.firstUpdated(Z);if(this.updated(Z),O&&this.isUpdatePending&&this.constructor.enabledWarnings.includes("change-in-update"))k("change-in-update",`Element ${this.localName} scheduled an update (generally because a property was set) after an update completed, causing a new update to be scheduled. This is inefficient and should be avoided unless the next update can only be scheduled as a side effect of the previous update.`)}__markUpdated(){this._$changedProperties=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this.__updatePromise}shouldUpdate(Z){return!0}update(Z){this.__reflectingProperties&&=this.__reflectingProperties.forEach(($)=>this.__propertyToAttribute($,this[$])),this.__markUpdated()}updated(Z){}firstUpdated(Z){}}M.elementStyles=[];M.shadowRootOptions={mode:"open"};M[b("elementProperties",M)]=new Map;M[b("finalized",M)]=new Map;fZ?.({ReactiveElement:M});if(O){M.enabledWarnings=["change-in-update","async-perform-update"];let Z=function($){if(!$.hasOwnProperty(b("enabledWarnings",$)))$.enabledWarnings=$.enabledWarnings.slice()};M.enableWarning=function($){if(Z(this),!this.enabledWarnings.includes($))this.enabledWarnings.push($)},M.disableWarning=function($){Z(this);let X=this.enabledWarnings.indexOf($);if(X>=0)this.enabledWarnings.splice(X,1)}}(U.reactiveElementVersions??=[]).push("2.1.2");if(O&&U.reactiveElementVersions.length>1)queueMicrotask(()=>{k("multiple-versions","Multiple versions of Lit loaded. Loading multiple versions is not recommended.")});var _=globalThis,G=(Z)=>{if(!_.emitLitDebugLogEvents)return;_.dispatchEvent(new CustomEvent("lit-debug",{detail:Z}))},X0=0,y;_.litIssuedWarnings??=new Set,y=(Z,$)=>{if($+=Z?` See https://lit.dev/msg/${Z} for more information.`:"",!_.litIssuedWarnings.has($)&&!_.litIssuedWarnings.has(Z))console.warn($),_.litIssuedWarnings.add($)},queueMicrotask(()=>{y("dev-mode","Lit is in dev mode. Not recommended for production!")});var f=_.ShadyDOM?.inUse&&_.ShadyDOM?.noPatch===!0?_.ShadyDOM.wrap:(Z)=>Z,o=_.trustedTypes,CZ=o?o.createPolicy("lit-html",{createHTML:(Z)=>Z}):void 0,K0=(Z)=>Z,n=(Z,$,X)=>K0,Y0=(Z)=>{if(P!==n)throw Error("Attempted to overwrite existing lit-html security policy. setSanitizeDOMValueFactory should be called at most once.");P=Z},Q0=()=>{P=n},BZ=(Z,$,X)=>{return P(Z,$,X)},SZ="$lit$",C=`lit$${Math.random().toFixed(9).slice(2)}$`,IZ="?"+C,B0=`<${IZ}>`,I=document,c=()=>I.createComment(""),g=(Z)=>Z===null||typeof Z!="object"&&typeof Z!="function",GZ=Array.isArray,G0=(Z)=>GZ(Z)||typeof Z?.[Symbol.iterator]==="function",XZ=`[ 	
\f\r]`,H0=`[^ 	
\f\r"'\`<>=]`,J0=`[^\\s"'>=/]`,E=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,NZ=1,KZ=2,q0=3,VZ=/-->/g,TZ=/>/g,D=new RegExp(`>|${XZ}(?:(${J0}+)(${XZ}*=${XZ}*(?:${H0}|("|')|))|$)`,"g"),j0=0,DZ=1,z0=2,RZ=3,YZ=/'/g,QZ=/"/g,wZ=/^(?:script|style|textarea|title)$/i,F0=1,s=2,l=3,HZ=1,r=2,W0=3,U0=4,O0=5,JZ=6,M0=7,qZ=(Z)=>($,...X)=>{if($.some((K)=>K===void 0))console.warn(`Some template strings are undefined.
This is probably caused by illegal octal escape sequences.`);if(X.some((K)=>K?._$litStatic$))y("",`Static values 'literal' or 'unsafeStatic' cannot be used as values to non-static templates.
Please use the static 'html' tag function. See https://lit.dev/docs/templates/expressions/#static-expressions`);return{["_$litType$"]:Z,strings:$,values:X}},J=qZ(F0),E0=qZ(s),h0=qZ(l),w=Symbol.for("lit-noChange"),j=Symbol.for("lit-nothing"),LZ=new WeakMap,S=I.createTreeWalker(I,129),P=n;function PZ(Z,$){if(!GZ(Z)||!Z.hasOwnProperty("raw")){let X="invalid template strings array";throw X=`
          Internal Error: expected template strings to be an array
          with a 'raw' field. Faking a template strings array by
          calling html or svg like an ordinary function is effectively
          the same as calling unsafeHtml and can lead to major security
          issues, e.g. opening your code up to XSS attacks.
          If you're using the html or svg tagged template functions normally
          and still seeing this error, please file a bug at
          https://github.com/lit/lit/issues/new?template=bug_report.md
          and include information about your build tooling, if any.
        `.trim().replace(/\n */g,`
`),Error(X)}return CZ!==void 0?CZ.createHTML($):$}var _0=(Z,$)=>{let X=Z.length-1,K=[],Y=$===s?"<svg>":$===l?"<math>":"",Q,B=E;for(let z=0;z<X;z++){let A=Z[z],q=-1,W,T=0,F;while(T<A.length){if(B.lastIndex=T,F=B.exec(A),F===null)break;if(T=B.lastIndex,B===E){if(F[NZ]==="!--")B=VZ;else if(F[NZ]!==void 0)B=TZ;else if(F[KZ]!==void 0){if(wZ.test(F[KZ]))Q=new RegExp(`</${F[KZ]}`,"g");B=D}else if(F[q0]!==void 0)throw Error("Bindings in tag names are not supported. Please use static templates instead. See https://lit.dev/docs/templates/expressions/#static-expressions")}else if(B===D)if(F[j0]===">")B=Q??E,q=-1;else if(F[DZ]===void 0)q=-2;else q=B.lastIndex-F[z0].length,W=F[DZ],B=F[RZ]===void 0?D:F[RZ]==='"'?QZ:YZ;else if(B===QZ||B===YZ)B=D;else if(B===VZ||B===TZ)B=E;else B=D,Q=void 0}console.assert(q===-1||B===D||B===YZ||B===QZ,"unexpected parse state B");let L=B===D&&Z[z+1].startsWith("/>")?" ":"";Y+=B===E?A+B0:q>=0?(K.push(W),A.slice(0,q)+SZ+A.slice(q))+C+L:A+C+(q===-2?z:L)}let H=Y+(Z[X]||"<?>")+($===s?"</svg>":$===l?"</math>":"");return[PZ(Z,H),K]};class v{constructor({strings:Z,["_$litType$"]:$},X){this.parts=[];let K,Y=0,Q=0,B=Z.length-1,H=this.parts,[z,A]=_0(Z,$);if(this.el=v.createElement(z,X),S.currentNode=this.el.content,$===s||$===l){let q=this.el.content.firstChild;q.replaceWith(...q.childNodes)}while((K=S.nextNode())!==null&&H.length<B){if(K.nodeType===1){{let q=K.localName;if(/^(?:textarea|template)$/i.test(q)&&K.innerHTML.includes(C)){let W=`Expressions are not supported inside \`${q}\` elements. See https://lit.dev/msg/expression-in-${q} for more information.`;if(q==="template")throw Error(W);else y("",W)}}if(K.hasAttributes()){for(let q of K.getAttributeNames())if(q.endsWith(SZ)){let W=A[Q++],F=K.getAttribute(q).split(C),L=/([.?@])?(.*)/.exec(W);H.push({type:HZ,index:Y,name:L[2],strings:F,ctor:L[1]==="."?xZ:L[1]==="?"?EZ:L[1]==="@"?hZ:p}),K.removeAttribute(q)}else if(q.startsWith(C))H.push({type:JZ,index:Y}),K.removeAttribute(q)}if(wZ.test(K.tagName)){let q=K.textContent.split(C),W=q.length-1;if(W>0){K.textContent=o?o.emptyScript:"";for(let T=0;T<W;T++)K.append(q[T],c()),S.nextNode(),H.push({type:r,index:++Y});K.append(q[W],c())}}}else if(K.nodeType===8)if(K.data===IZ)H.push({type:r,index:Y});else{let W=-1;while((W=K.data.indexOf(C,W+1))!==-1)H.push({type:M0,index:Y}),W+=C.length-1}Y++}if(A.length!==Q)throw Error('Detected duplicate attribute bindings. This occurs if your template has duplicate attributes on an element tag. For example "<input ?disabled=${true} ?disabled=${false}>" contains a duplicate "disabled" attribute. The error was detected in the following template: \n`'+Z.join("${...}")+"`");G&&G({kind:"template prep",template:this,clonableTemplate:this.el,parts:this.parts,strings:Z})}static createElement(Z,$){let X=I.createElement("template");return X.innerHTML=Z,X}}function x(Z,$,X=Z,K){if($===w)return $;let Y=K!==void 0?X.__directives?.[K]:X.__directive,Q=g($)?void 0:$._$litDirective$;if(Y?.constructor!==Q){if(Y?._$notifyDirectiveConnectionChanged?.(!1),Q===void 0)Y=void 0;else Y=new Q(Z),Y._$initialize(Z,X,K);if(K!==void 0)(X.__directives??=[])[K]=Y;else X.__directive=Y}if(Y!==void 0)$=x(Z,Y._$resolve(Z,$.values),Y,K);return $}class bZ{constructor(Z,$){this._$parts=[],this._$disconnectableChildren=void 0,this._$template=Z,this._$parent=$}get parentNode(){return this._$parent.parentNode}get _$isConnected(){return this._$parent._$isConnected}_clone(Z){let{el:{content:$},parts:X}=this._$template,K=(Z?.creationScope??I).importNode($,!0);S.currentNode=K;let Y=S.nextNode(),Q=0,B=0,H=X[0];while(H!==void 0){if(Q===H.index){let z;if(H.type===r)z=new m(Y,Y.nextSibling,this,Z);else if(H.type===HZ)z=new H.ctor(Y,H.name,H.strings,this,Z);else if(H.type===JZ)z=new yZ(Y,this,Z);this._$parts.push(z),H=X[++B]}if(Q!==H?.index)Y=S.nextNode(),Q++}return S.currentNode=I,K}_update(Z){let $=0;for(let X of this._$parts){if(X!==void 0)if(G&&G({kind:"set part",part:X,value:Z[$],valueIndex:$,values:Z,templateInstance:this}),X.strings!==void 0)X._$setValue(Z,X,$),$+=X.strings.length-2;else X._$setValue(Z[$]);$++}}}class m{get _$isConnected(){return this._$parent?._$isConnected??this.__isConnected}constructor(Z,$,X,K){this.type=r,this._$committedValue=j,this._$disconnectableChildren=void 0,this._$startNode=Z,this._$endNode=$,this._$parent=X,this.options=K,this.__isConnected=K?.isConnected??!0,this._textSanitizer=void 0}get parentNode(){let Z=f(this._$startNode).parentNode,$=this._$parent;if($!==void 0&&Z?.nodeType===11)Z=$.parentNode;return Z}get startNode(){return this._$startNode}get endNode(){return this._$endNode}_$setValue(Z,$=this){if(this.parentNode===null)throw Error("This `ChildPart` has no `parentNode` and therefore cannot accept a value. This likely means the element containing the part was manipulated in an unsupported way outside of Lit's control such that the part's marker nodes were ejected from DOM. For example, setting the element's `innerHTML` or `textContent` can do this.");if(Z=x(this,Z,$),g(Z)){if(Z===j||Z==null||Z===""){if(this._$committedValue!==j)G&&G({kind:"commit nothing to child",start:this._$startNode,end:this._$endNode,parent:this._$parent,options:this.options}),this._$clear();this._$committedValue=j}else if(Z!==this._$committedValue&&Z!==w)this._commitText(Z)}else if(Z._$litType$!==void 0)this._commitTemplateResult(Z);else if(Z.nodeType!==void 0){if(this.options?.host===Z){this._commitText("[probable mistake: rendered a template's host in itself (commonly caused by writing ${this} in a template]"),console.warn("Attempted to render the template host",Z,"inside itself. This is almost always a mistake, and in dev mode ","we render some warning text. In production however, we'll ","render it, which will usually result in an error, and sometimes ","in the element disappearing from the DOM.");return}this._commitNode(Z)}else if(G0(Z))this._commitIterable(Z);else this._commitText(Z)}_insert(Z){return f(f(this._$startNode).parentNode).insertBefore(Z,this._$endNode)}_commitNode(Z){if(this._$committedValue!==Z){if(this._$clear(),P!==n){let $=this._$startNode.parentNode?.nodeName;if($==="STYLE"||$==="SCRIPT"){let X="Forbidden";if($==="STYLE")X="Lit does not support binding inside style nodes. This is a security risk, as style injection attacks can exfiltrate data and spoof UIs. Consider instead using css`...` literals to compose styles, and do dynamic styling with css custom properties, ::parts, <slot>s, and by mutating the DOM rather than stylesheets.";else X="Lit does not support binding inside script nodes. This is a security risk, as it could allow arbitrary code execution.";throw Error(X)}}G&&G({kind:"commit node",start:this._$startNode,parent:this._$parent,value:Z,options:this.options}),this._$committedValue=this._insert(Z)}}_commitText(Z){if(this._$committedValue!==j&&g(this._$committedValue)){let $=f(this._$startNode).nextSibling;if(this._textSanitizer===void 0)this._textSanitizer=BZ($,"data","property");Z=this._textSanitizer(Z),G&&G({kind:"commit text",node:$,value:Z,options:this.options}),$.data=Z}else{let $=I.createTextNode("");if(this._commitNode($),this._textSanitizer===void 0)this._textSanitizer=BZ($,"data","property");Z=this._textSanitizer(Z),G&&G({kind:"commit text",node:$,value:Z,options:this.options}),$.data=Z}this._$committedValue=Z}_commitTemplateResult(Z){let{values:$,["_$litType$"]:X}=Z,K=typeof X==="number"?this._$getTemplate(Z):(X.el===void 0&&(X.el=v.createElement(PZ(X.h,X.h[0]),this.options)),X);if(this._$committedValue?._$template===K)G&&G({kind:"template updating",template:K,instance:this._$committedValue,parts:this._$committedValue._$parts,options:this.options,values:$}),this._$committedValue._update($);else{let Y=new bZ(K,this),Q=Y._clone(this.options);G&&G({kind:"template instantiated",template:K,instance:Y,parts:Y._$parts,options:this.options,fragment:Q,values:$}),Y._update($),G&&G({kind:"template instantiated and updated",template:K,instance:Y,parts:Y._$parts,options:this.options,fragment:Q,values:$}),this._commitNode(Q),this._$committedValue=Y}}_$getTemplate(Z){let $=LZ.get(Z.strings);if($===void 0)LZ.set(Z.strings,$=new v(Z));return $}_commitIterable(Z){if(!GZ(this._$committedValue))this._$committedValue=[],this._$clear();let $=this._$committedValue,X=0,K;for(let Y of Z){if(X===$.length)$.push(K=new m(this._insert(c()),this._insert(c()),this,this.options));else K=$[X];K._$setValue(Y),X++}if(X<$.length)this._$clear(K&&f(K._$endNode).nextSibling,X),$.length=X}_$clear(Z=f(this._$startNode).nextSibling,$){this._$notifyConnectionChanged?.(!1,!0,$);while(Z!==this._$endNode){let X=f(Z).nextSibling;f(Z).remove(),Z=X}}setConnected(Z){if(this._$parent===void 0)this.__isConnected=Z,this._$notifyConnectionChanged?.(Z);else throw Error("part.setConnected() may only be called on a RootPart returned from render().")}}class p{get tagName(){return this.element.tagName}get _$isConnected(){return this._$parent._$isConnected}constructor(Z,$,X,K,Y){if(this.type=HZ,this._$committedValue=j,this._$disconnectableChildren=void 0,this.element=Z,this.name=$,this._$parent=K,this.options=Y,X.length>2||X[0]!==""||X[1]!=="")this._$committedValue=Array(X.length-1).fill(new String),this.strings=X;else this._$committedValue=j;this._sanitizer=void 0}_$setValue(Z,$=this,X,K){let Y=this.strings,Q=!1;if(Y===void 0){if(Z=x(this,Z,$,0),Q=!g(Z)||Z!==this._$committedValue&&Z!==w,Q)this._$committedValue=Z}else{let B=Z;Z=Y[0];let H,z;for(H=0;H<Y.length-1;H++){if(z=x(this,B[X+H],$,H),z===w)z=this._$committedValue[H];if(Q||=!g(z)||z!==this._$committedValue[H],z===j)Z=j;else if(Z!==j)Z+=(z??"")+Y[H+1];this._$committedValue[H]=z}}if(Q&&!K)this._commitValue(Z)}_commitValue(Z){if(Z===j)f(this.element).removeAttribute(this.name);else{if(this._sanitizer===void 0)this._sanitizer=P(this.element,this.name,"attribute");Z=this._sanitizer(Z??""),G&&G({kind:"commit attribute",element:this.element,name:this.name,value:Z,options:this.options}),f(this.element).setAttribute(this.name,Z??"")}}}class xZ extends p{constructor(){super(...arguments);this.type=W0}_commitValue(Z){if(this._sanitizer===void 0)this._sanitizer=P(this.element,this.name,"property");Z=this._sanitizer(Z),G&&G({kind:"commit property",element:this.element,name:this.name,value:Z,options:this.options}),this.element[this.name]=Z===j?void 0:Z}}class EZ extends p{constructor(){super(...arguments);this.type=U0}_commitValue(Z){G&&G({kind:"commit boolean attribute",element:this.element,name:this.name,value:!!(Z&&Z!==j),options:this.options}),f(this.element).toggleAttribute(this.name,!!Z&&Z!==j)}}class hZ extends p{constructor(Z,$,X,K,Y){super(Z,$,X,K,Y);if(this.type=O0,this.strings!==void 0)throw Error(`A \`<${Z.localName}>\` has a \`@${$}=...\` listener with invalid content. Event listeners in templates must have exactly one expression and no surrounding text.`)}_$setValue(Z,$=this){if(Z=x(this,Z,$,0)??j,Z===w)return;let X=this._$committedValue,K=Z===j&&X!==j||Z.capture!==X.capture||Z.once!==X.once||Z.passive!==X.passive,Y=Z!==j&&(X===j||K);if(G&&G({kind:"commit event listener",element:this.element,name:this.name,value:Z,options:this.options,removeListener:K,addListener:Y,oldListener:X}),K)this.element.removeEventListener(this.name,this,X);if(Y)this.element.addEventListener(this.name,this,Z);this._$committedValue=Z}handleEvent(Z){if(typeof this._$committedValue==="function")this._$committedValue.call(this.options?.host??this.element,Z);else this._$committedValue.handleEvent(Z)}}class yZ{constructor(Z,$,X){this.element=Z,this.type=JZ,this._$disconnectableChildren=void 0,this._$parent=$,this.options=X}get _$isConnected(){return this._$parent._$isConnected}_$setValue(Z){G&&G({kind:"commit to element binding",element:this.element,value:Z,options:this.options}),x(this,Z)}}var k0=_.litHtmlPolyfillSupportDevMode;k0?.(v,m);(_.litHtmlVersions??=[]).push("3.3.3");if(_.litHtmlVersions.length>1)queueMicrotask(()=>{y("multiple-versions","Multiple versions of Lit loaded. Loading multiple versions is not recommended.")});var h=(Z,$,X)=>{if($==null)throw TypeError(`The container to render into may not be ${$}`);let K=X0++,Y=X?.renderBefore??$,Q=Y._$litPart$;if(G&&G({kind:"begin render",id:K,value:Z,container:$,options:X,part:Q}),Q===void 0){let B=X?.renderBefore??null;Y._$litPart$=Q=new m($.insertBefore(c(),B),B,void 0,X??{})}return Q._$setValue(Z),G&&G({kind:"end render",id:K,value:Z,container:$,options:X,part:Q}),Q};h.setSanitizer=Y0,h.createSanitizer=BZ,h._testOnlyClearSanitizerFactoryDoNotCallOrElse=Q0;var f0=(Z,$)=>Z,jZ=!0,N=globalThis,cZ;if(jZ)N.litIssuedWarnings??=new Set,cZ=(Z,$)=>{if($+=` See https://lit.dev/msg/${Z} for more information.`,!N.litIssuedWarnings.has($)&&!N.litIssuedWarnings.has(Z))console.warn($),N.litIssuedWarnings.add($)};class R extends M{constructor(){super(...arguments);this.renderOptions={host:this},this.__childPart=void 0}createRenderRoot(){let Z=super.createRenderRoot();return this.renderOptions.renderBefore??=Z.firstChild,Z}update(Z){let $=this.render();if(!this.hasUpdated)this.renderOptions.isConnected=this.isConnected;super.update(Z),this.__childPart=h($,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this.__childPart?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this.__childPart?.setConnected(!1)}render(){return w}}R._$litElement$=!0;R[f0("finalized",R)]=!0;N.litElementHydrateSupport?.({LitElement:R});var A0=jZ?N.litElementPolyfillSupportDevMode:N.litElementPolyfillSupport;A0?.({LitElement:R});(N.litElementVersions??=[]).push("4.2.2");if(jZ&&N.litElementVersions.length>1)queueMicrotask(()=>{cZ("multiple-versions","Multiple versions of Lit loaded. Loading multiple versions is not recommended.")});class u extends Error{code;constructor(Z,$){super($);this.name="ApiError",this.code=Z}}var d=async(Z,$)=>{let X=await fetch(Z,{...$,headers:{"content-type":"application/json",...$?.headers??{}}});if(X.status===204)return;let K=await X.json();if(!X.ok){let Y=K;throw new u(Y.error?.code??"UNKNOWN",Y.error?.message??"request failed")}return K},gZ=(Z)=>d("/v1/plans",{method:"POST",body:JSON.stringify(Z)});var vZ=(Z,$,X,K)=>d(`/v1/plans/${Z}/days/${$}/slots/${X}/complete`,{method:"POST",body:JSON.stringify(K)}),mZ=(Z,$)=>d(`/v1/plans/${Z}/days/${$}/progress`),pZ=()=>d("/v1/settings"),uZ=(Z)=>d("/v1/settings",{method:"PATCH",body:JSON.stringify({theme:Z})});var N0=[{id:"grind",label:"Grind Mindset"},{id:"girlypop",label:"Girly Pop"},{id:"minimal",label:"Minimal"},{id:"midnight",label:"Midnight"}],V0=[{id:"build_muscle",label:"Build muscle"},{id:"lose_fat",label:"Lose fat"},{id:"build_endurance",label:"Build endurance"},{id:"recomp",label:"Recomp"}],T0=["beginner","intermediate","advanced"],dZ=["barbell","dumbbell","cable","machine","kettlebell","band","bodyweight"],D0=["glutes","hamstrings","quads","calves","back","chest","shoulders","biceps","triceps","core","full_body"],R0=[{id:"mon",label:"Monday"},{id:"tue",label:"Tuesday"},{id:"wed",label:"Wednesday"},{id:"thu",label:"Thursday"},{id:"fri",label:"Friday"},{id:"sat",label:"Saturday"},{id:"sun",label:"Sunday"}],L0=["rest","pilates","physio","steps","custom"],S0=[{weekday:"mon",mode:"train",focus:["glutes","hamstrings"]},{weekday:"tue",mode:"train",focus:["back","biceps"]},{weekday:"wed",mode:"pilates",focus:[]},{weekday:"thu",mode:"train",focus:["quads","shoulders"]},{weekday:"fri",mode:"train",focus:["chest","triceps"]},{weekday:"sat",mode:"train",focus:["glutes","core"]},{weekday:"sun",mode:"rest",focus:[]}],V=(Z)=>Z.charAt(0).toUpperCase()+Z.slice(1).replace(/_/g," "),zZ=(Z)=>R0.find(($)=>$.id===Z)?.label??Z;class iZ extends R{static properties={theme:{state:!0},view:{state:!0},goal:{state:!0},experience:{state:!0},equipment:{state:!0},sessionMinutes:{state:!0},warmupMinutes:{state:!0},cooldownMinutes:{state:!0},physioMinutes:{state:!0},variation:{state:!0},days:{state:!0},plan:{state:!0},selectedDayId:{state:!0},progress:{state:!0},busy:{state:!0},error:{state:!0}};slotInputs={};constructor(){super();this.theme=I0(),this.view="generate",this.goal="build_muscle",this.experience="intermediate",this.equipment=[...dZ],this.sessionMinutes=60,this.warmupMinutes=8,this.cooldownMinutes=5,this.physioMinutes=0,this.variation="A",this.days=S0.map((Z)=>({...Z,focus:[...Z.focus]})),this.plan=null,this.selectedDayId=null,this.progress={},this.busy=!1,this.error=null}connectedCallback(){super.connectedCallback(),this.syncSettings()}async syncSettings(){try{let{settings:Z}=await pZ();this.applyTheme(Z.theme)}catch{}}applyTheme(Z){this.theme=Z,document.documentElement.setAttribute("data-theme",Z);try{localStorage.setItem("gf-theme",Z)}catch{}}onThemeChange(Z){let $=Z.target.value;this.applyTheme($),uZ($).catch(()=>{return})}toggleEquipment(Z){this.equipment=this.equipment.includes(Z)?this.equipment.filter(($)=>$!==Z):[...this.equipment,Z]}setDayMode(Z,$){this.days=this.days.map((X)=>X.weekday===Z?{...X,mode:$}:X)}toggleFocus(Z,$){this.days=this.days.map((X)=>{if(X.weekday!==Z)return X;let K=X.focus.includes($)?X.focus.filter((Y)=>Y!==$):[...X.focus,$];return{...X,focus:K}})}buildRequest(){return this.days.map((Z)=>{if(Z.mode==="train"){let $=Z.focus.length>0?Z.focus:["full_body"];return{weekday:Z.weekday,focus:$}}return{weekday:Z.weekday,activity:Z.mode,label:V(Z.mode)}})}async onGenerate(){if(this.equipment.length===0){this.error="Pick at least one piece of equipment.";return}this.busy=!0,this.error=null;try{let{plan:Z}=await gZ({goal:this.goal,experience:this.experience,equipment:this.equipment,timeBudget:{sessionMinutes:this.sessionMinutes,warmupMinutes:this.warmupMinutes,cooldownMinutes:this.cooldownMinutes,physioMinutes:this.physioMinutes},days:this.buildRequest(),variation:this.variation});this.plan=Z,this.progress={},this.selectedDayId=null,this.view="week"}catch(Z){this.error=Z instanceof u?Z.message:"Could not generate a plan."}finally{this.busy=!1}}openTracker(Z){this.selectedDayId=Z,this.refreshProgress(Z)}closeTracker(){this.selectedDayId=null}async refreshProgress(Z){if(this.plan===null)return;try{let{progress:$}=await mZ(this.plan.id,Z);this.progress={...this.progress,[Z]:$}}catch{}}onSlotInput(Z,$,X){let K=this.slotInputs[Z]??{},Y=X===""?void 0:Number(X);this.slotInputs={...this.slotInputs,[Z]:{...K,[$]:Y}}}async onCompleteSlot(Z,$){if(this.plan===null)return;let X=this.slotInputs[$]??{};this.busy=!0,this.error=null;try{let{progress:K}=await vZ(this.plan.id,Z,$,{loadKg:X.loadKg??0,...X.reps===void 0?{}:{reps:X.reps}});this.progress={...this.progress,[Z]:K}}catch(K){this.error=K instanceof u?K.message:"Could not save that set."}finally{this.busy=!1}}render(){return J`
      ${this.renderHeader()}
      <main class="content">
        ${this.error!==null?J`<div class="banner error" role="alert" data-testid="error">${this.error}</div>`:j}
        ${this.view==="generate"?this.renderGenerator():this.renderWeek()}
      </main>
      ${this.selectedDayId!==null?this.renderTracker():j}
    `}renderHeader(){return J`
      <header class="topbar">
        <div class="brand" data-testid="brand">
          <span class="logo">◣</span>
          <span>Grindform</span>
        </div>
        <nav class="nav">
          <button
            class=${this.view==="generate"?"tab active":"tab"}
            data-testid="nav-generate"
            @click=${()=>{this.view="generate"}}
          >
            Build
          </button>
          <button
            class=${this.view==="week"?"tab active":"tab"}
            data-testid="nav-week"
            ?disabled=${this.plan===null}
            @click=${()=>{if(this.plan!==null)this.view="week"}}
          >
            My week
          </button>
        </nav>
        <label class="theme">
          <span class="sr-only">Theme</span>
          <select data-testid="theme-picker" .value=${this.theme} @change=${this.onThemeChange}>
            ${N0.map((Z)=>J`<option value=${Z.id}>${Z.label}</option>`)}
          </select>
        </label>
      </header>
    `}renderGenerator(){return J`
      <section class="panel" data-testid="generator">
        <h1>Plan your week</h1>
        <p class="lede">
          Pick a goal and a weekly shape. Block out days for Pilates or Physio, reserve warm-up,
          cool-down and a first-15-minutes physio slot — Grindform fills in the rest.
        </p>

        <div class="grid">
          <label class="field">
            <span>Goal</span>
            <select
              data-testid="goal"
              .value=${this.goal}
              @change=${(Z)=>{this.goal=Z.target.value}}
            >
              ${V0.map((Z)=>J`<option value=${Z.id}>${Z.label}</option>`)}
            </select>
          </label>

          <label class="field">
            <span>Experience</span>
            <select
              data-testid="experience"
              .value=${this.experience}
              @change=${(Z)=>{this.experience=Z.target.value}}
            >
              ${T0.map((Z)=>J`<option value=${Z}>${V(Z)}</option>`)}
            </select>
          </label>

          <label class="field">
            <span>Variation</span>
            <select
              data-testid="variation"
              .value=${this.variation}
              @change=${(Z)=>{this.variation=Z.target.value}}
            >
              <option value="A">A week</option>
              <option value="B">B week</option>
            </select>
          </label>
        </div>

        <fieldset class="block">
          <legend>Time budget (minutes)</legend>
          <div class="grid">
            ${this.renderNumber("Session","sessionMinutes",this.sessionMinutes,20,180)}
            ${this.renderNumber("Warm-up","warmupMinutes",this.warmupMinutes,0,30)}
            ${this.renderNumber("Cool-down","cooldownMinutes",this.cooldownMinutes,0,30)}
            ${this.renderNumber("Physio (first block)","physioMinutes",this.physioMinutes,0,30)}
          </div>
        </fieldset>

        <fieldset class="block">
          <legend>Equipment</legend>
          <div class="chips" data-testid="equipment">
            ${dZ.map((Z)=>J`
                <button
                  type="button"
                  class=${this.equipment.includes(Z)?"chip on":"chip"}
                  data-testid=${`equipment-${Z}`}
                  aria-pressed=${this.equipment.includes(Z)}
                  @click=${()=>this.toggleEquipment(Z)}
                >
                  ${V(Z)}
                </button>
              `)}
          </div>
        </fieldset>

        <fieldset class="block">
          <legend>Your week</legend>
          <div class="days">${this.days.map((Z)=>this.renderDayConfig(Z))}</div>
        </fieldset>

        <button
          class="cta"
          data-testid="generate"
          ?disabled=${this.busy}
          @click=${()=>void this.onGenerate()}
        >
          ${this.busy?"Generating…":"Generate my week"}
        </button>
      </section>
    `}renderNumber(Z,$,X,K,Y){return J`
      <label class="field">
        <span>${Z}</span>
        <input
          type="number"
          inputmode="numeric"
          data-testid=${`time-${$}`}
          min=${K}
          max=${Y}
          .value=${String(X)}
          @input=${(Q)=>{this[$]=Number(Q.target.value)}}
        />
      </label>
    `}renderDayConfig(Z){return J`
      <div class="day-row" data-testid=${`dayrow-${Z.weekday}`}>
        <div class="day-head">
          <strong>${zZ(Z.weekday)}</strong>
          <select
            data-testid=${`day-mode-${Z.weekday}`}
            .value=${Z.mode}
            @change=${($)=>this.setDayMode(Z.weekday,$.target.value)}
          >
            <option value="train">Training</option>
            ${L0.map(($)=>J`<option value=${$}>${V($)}</option>`)}
          </select>
        </div>
        ${Z.mode==="train"?J`
              <div class="chips small" data-testid=${`day-focus-${Z.weekday}`}>
                ${D0.map(($)=>J`
                    <button
                      type="button"
                      class=${Z.focus.includes($)?"chip on":"chip"}
                      data-testid=${`focus-${Z.weekday}-${$}`}
                      aria-pressed=${Z.focus.includes($)}
                      @click=${()=>this.toggleFocus(Z.weekday,$)}
                    >
                      ${V($)}
                    </button>
                  `)}
              </div>
            `:J`<p class="blocked-note">Blocked for ${V(Z.mode)} — no lifting generated.</p>`}
      </div>
    `}renderWeek(){if(this.plan===null)return J`<section class="panel"><p>No plan yet. Build one first.</p></section>`;let Z=this.plan;return J`
      <section class="panel" data-testid="week">
        <div class="week-head">
          <h1>${V(Z.goal)} · Week ${Z.variation}</h1>
          <button class="ghost" data-testid="rebuild" @click=${()=>void this.onGenerate()}>
            Boredom swap ↻
          </button>
        </div>
        <div class="week-grid">${Z.days.map(($)=>this.renderDayCard($))}</div>
      </section>
    `}renderDayCard(Z){let $=this.progress[Z.id],X=Z.activity!==void 0;return J`
      <article class=${X?"card blocked":"card"} data-testid=${`card-${Z.weekday}`}>
        <header class="card-head">
          <h2>${zZ(Z.weekday)}</h2>
          <span class="mins">${Z.estMinutes}m</span>
        </header>
        ${X?J`<p class="activity" data-testid=${`activity-${Z.weekday}`}>
              ${Z.label??V(Z.activity??"rest")}
            </p>`:J`
              <p class="focus">${Z.focus.map((K)=>V(K)).join(" · ")}</p>
              <ul class="blocks">
                ${Z.blocks.map((K)=>J`<li><span class="btag ${K.type}">${K.title}</span> ${K.estMinutes}m</li>`)}
              </ul>
              ${$!==void 0?J`<div
                    class="bar"
                    data-testid=${`bar-${Z.weekday}`}
                    aria-label="progress"
                  >
                    <span style=${`width:${$.percentComplete}%`}></span>
                  </div>`:j}
              <button
                class="ghost full"
                data-testid=${`track-${Z.weekday}`}
                @click=${()=>this.openTracker(Z.id)}
              >
                Track session
              </button>
            `}
      </article>
    `}renderTracker(){let Z=this.plan,$=Z?.days.find((K)=>K.id===this.selectedDayId);if(Z===void 0||Z===null||$===void 0)return J`${j}`;let X=this.progress[$.id];return J`
      <div class="overlay" data-testid="tracker" @click=${this.onOverlayClick}>
        <div class="sheet" @click=${(K)=>K.stopPropagation()}>
          <header class="sheet-head">
            <h2>${zZ($.weekday)} session</h2>
            <button class="icon" data-testid="tracker-close" @click=${this.closeTracker}>✕</button>
          </header>
          ${X!==void 0?J`<div class="bar big" data-testid="tracker-bar">
                  <span style=${`width:${X.percentComplete}%`}></span>
                </div>
                <p class="pct" data-testid="tracker-pct">${X.percentComplete}% complete</p>`:j}
          <div class="track-list">
            ${$.blocks.map((K)=>this.renderTrackBlock($.id,K))}
          </div>
        </div>
      </div>
    `}renderTrackBlock(Z,$){if($.slots.length===0)return J`<div class="track-block">
        <h3>${$.title}</h3>
        ${$.note!==void 0?J`<p class="note">${$.note}</p>`:j}
      </div>`;let X=this.progress[Z];return J`
      <div class="track-block">
        <h3>${$.title}</h3>
        ${$.slots.map((K)=>{let Q=X?.slots.find((B)=>B.slotId===K.id)?.complete??!1;return J`
            <div class=${Q?"slot done":"slot"} data-testid=${`slot-${K.id}`}>
              <div class="slot-name">
                <strong>${K.name}</strong>
                <small
                  >${K.scheme.sets}×${K.scheme.repsLow}-${K.scheme.repsHigh}${K.scheme.perSide?"/side":""}</small
                >
              </div>
              <div class="slot-inputs">
                <input
                  type="number"
                  inputmode="decimal"
                  placeholder="kg"
                  data-testid=${`load-${K.id}`}
                  @input=${(B)=>this.onSlotInput(K.id,"loadKg",B.target.value)}
                />
                <input
                  type="number"
                  inputmode="numeric"
                  placeholder="reps"
                  data-testid=${`reps-${K.id}`}
                  @input=${(B)=>this.onSlotInput(K.id,"reps",B.target.value)}
                />
                <button
                  class="done-btn"
                  data-testid=${`complete-${K.id}`}
                  ?disabled=${this.busy}
                  @click=${()=>void this.onCompleteSlot(Z,K.id)}
                >
                  ${Q?"Done ✓":"Mark done"}
                </button>
              </div>
            </div>
          `})}
      </div>
    `}onOverlayClick=()=>{this.closeTracker()};static styles=WZ`
    :host {
      display: block;
      min-height: 100vh;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      padding-top: calc(12px + env(safe-area-inset-top));
      background: var(--gf-surface);
      border-bottom: 1px solid var(--gf-border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: 0.5px;
    }
    .logo {
      color: var(--gf-accent);
    }
    .nav {
      display: flex;
      gap: 6px;
      margin-left: auto;
    }
    .tab {
      appearance: none;
      border: 1px solid transparent;
      background: transparent;
      color: var(--gf-muted);
      font: inherit;
      font-weight: 600;
      padding: 10px 14px;
      min-height: 44px;
      border-radius: var(--gf-radius);
      cursor: pointer;
    }
    .tab.active {
      color: var(--gf-text);
      background: var(--gf-surface-2);
    }
    .tab:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .theme select,
    .field select,
    .field input,
    .day-head select {
      font: inherit;
      color: var(--gf-text);
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 10px 12px;
      min-height: 44px;
    }
    .content {
      max-width: 1080px;
      margin: 0 auto;
      padding: 16px;
      padding-bottom: calc(48px + env(safe-area-inset-bottom));
    }
    .panel {
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 20px;
      box-shadow: var(--gf-shadow);
    }
    h1 {
      margin: 0 0 6px;
      font-size: 1.5rem;
    }
    .lede {
      color: var(--gf-muted);
      margin: 0 0 18px;
      max-width: 60ch;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .block {
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 14px;
      margin: 18px 0;
    }
    legend {
      padding: 0 6px;
      font-weight: 700;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      appearance: none;
      font: inherit;
      cursor: pointer;
      border: 1px solid var(--gf-border);
      background: var(--gf-surface-2);
      color: var(--gf-muted);
      border-radius: 999px;
      padding: 8px 14px;
      min-height: 40px;
    }
    .chip.on {
      background: var(--gf-accent);
      color: var(--gf-accent-text);
      border-color: var(--gf-accent);
    }
    .chips.small .chip {
      font-size: 0.82rem;
      padding: 6px 10px;
      min-height: 36px;
    }
    .days {
      display: grid;
      gap: 12px;
    }
    .day-row {
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 12px;
    }
    .day-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .blocked-note {
      color: var(--gf-muted);
      margin: 4px 0 0;
      font-size: 0.9rem;
    }
    .cta {
      appearance: none;
      width: 100%;
      font: inherit;
      font-weight: 800;
      font-size: 1.05rem;
      cursor: pointer;
      border: none;
      border-radius: var(--gf-radius);
      padding: 16px;
      min-height: 52px;
      background: var(--gf-accent);
      color: var(--gf-accent-text);
    }
    .cta:disabled {
      opacity: 0.6;
    }
    .banner.error {
      background: color-mix(in srgb, var(--gf-danger) 18%, var(--gf-surface));
      border: 1px solid var(--gf-danger);
      color: var(--gf-text);
      padding: 12px 14px;
      border-radius: var(--gf-radius);
      margin-bottom: 14px;
    }
    .week-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      gap: 10px;
    }
    .week-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .card.blocked {
      opacity: 0.85;
      border-style: dashed;
    }
    .card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .card-head h2 {
      margin: 0;
      font-size: 1.05rem;
    }
    .mins {
      color: var(--gf-muted);
      font-size: 0.85rem;
    }
    .activity {
      font-weight: 700;
      color: var(--gf-accent);
      margin: 6px 0;
    }
    .focus {
      color: var(--gf-muted);
      margin: 0;
      font-size: 0.85rem;
    }
    .blocks {
      list-style: none;
      margin: 4px 0;
      padding: 0;
      display: grid;
      gap: 4px;
      font-size: 0.82rem;
    }
    .btag {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      font-weight: 600;
    }
    .bar {
      height: 8px;
      border-radius: 999px;
      background: var(--gf-surface);
      overflow: hidden;
      border: 1px solid var(--gf-border);
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--gf-success);
    }
    .bar.big {
      height: 12px;
    }
    .ghost {
      appearance: none;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: transparent;
      color: var(--gf-text);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 10px 14px;
      min-height: 44px;
    }
    .ghost.full {
      width: 100%;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 20;
    }
    .sheet {
      background: var(--gf-surface);
      width: min(640px, 100%);
      max-height: 90vh;
      overflow: auto;
      border-radius: var(--gf-radius) var(--gf-radius) 0 0;
      padding: 18px;
      padding-bottom: calc(18px + env(safe-area-inset-bottom));
    }
    @media (min-width: 720px) {
      .overlay {
        align-items: center;
      }
      .sheet {
        border-radius: var(--gf-radius);
      }
    }
    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .sheet-head h2 {
      margin: 0;
    }
    .icon {
      appearance: none;
      cursor: pointer;
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      color: var(--gf-text);
      border-radius: 999px;
      width: 44px;
      height: 44px;
      font-size: 1rem;
    }
    .pct {
      color: var(--gf-muted);
      margin: 6px 0 12px;
    }
    .track-block {
      margin-bottom: 16px;
    }
    .track-block h3 {
      margin: 0 0 8px;
      font-size: 1rem;
    }
    .note {
      color: var(--gf-muted);
      margin: 0;
      font-size: 0.9rem;
    }
    .slot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px;
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      margin-bottom: 8px;
    }
    .slot.done {
      border-color: var(--gf-success);
      background: color-mix(in srgb, var(--gf-success) 12%, var(--gf-surface));
    }
    .slot-name {
      display: flex;
      flex-direction: column;
    }
    .slot-name small {
      color: var(--gf-muted);
    }
    .slot-inputs {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .slot-inputs input {
      width: 72px;
      font: inherit;
      color: var(--gf-text);
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 8px;
      min-height: 44px;
    }
    .done-btn {
      appearance: none;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: var(--gf-accent);
      color: var(--gf-accent-text);
      border: none;
      border-radius: var(--gf-radius);
      padding: 10px 12px;
      min-height: 44px;
    }
    .done-btn:disabled {
      opacity: 0.6;
    }
  `}function I0(){try{let Z=localStorage.getItem("gf-theme");if(Z==="grind"||Z==="girlypop"||Z==="minimal"||Z==="midnight")return Z}catch{}return"grind"}customElements.define("gf-app",iZ);export{iZ as GfApp};
