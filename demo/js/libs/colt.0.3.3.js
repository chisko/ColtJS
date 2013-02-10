/**
 * Copyright (c) 2013 ColtJS
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy 
 * of this software and associated documentation files (the "Software"), to deal 
 * in the Software without restriction, including without limitation the rights 
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies 
 * of the Software, and to permit persons to whom the Software is furnished to do 
 * so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all 
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT 
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION 
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE 
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
 
define(function () {

    /**
     * The main file in the framework.
     * This is where the router, dependencies and event delegation happens.
     * @type {Object}
     */

    var Colt = {

        // Will auto-populate all routes
        routes: {},

        // Will auto-populate all module objects
        scope: {},

        /**
         * Adds module to object and then initiates routes
         */

        init: function () {

            var module;

            // Make available in global scope
            window.Colt = Colt;

            require(Colt.modules, function () {

                // Load modules into application scope
                for (var i = 0, max = arguments.length; i < max; i++) {
                    module = Colt.modules[i].split('/').pop();
                    Colt.scope[module] = arguments[i];
                    // Add module-id to scope
                    Colt.scope[module].mid = module;
                    // Create element reference
                    Colt.scope[module].el = document.getElementById(module);
                    // If jQuery is available create jQuery accessible DOM reference
                    if (typeof jQuery !== 'undefined') {
                        Colt.scope[module].$el = jQuery('#' + module);
                    }
                }

                // Call the router
                Colt.router();

            });
        },

        /**
         * Setup Routing Table, Bind and Load Routes
         */

        router: function () {

            var cur_route = window.location.hash,
                el_lock = null;

            for (var module in Colt.scope) {
                for (var route in Colt.scope[module].routes) {
                    if(!Colt.routes.hasOwnProperty(route)){
                        Colt.routes[route] = [[module, Colt.scope[module].routes[route]]];
                    }else{
                        Colt.routes[route].push([module,Colt.scope[module].routes[route]]);
                    }
                }
            }

            // Initial route
            Colt.loadUrl(cur_route);

            // Bind change    
            window.onhashchange = function () {
                Colt.loadUrl(window.location.hash);
            };

        },

        /**
         * Checks to see that a current route matches a modules's route and hides all of those that don't need to be rendered
         * @param  {string} fragment the current hash
         */

        loadUrl: function (fragment) {
            var el_lock,
            module_name,
            url_data = {},
            i;

            // Break apart fragment
            fragment = fragment.replace('#!/', '');

            // Check for URL Data (Query String)
            fragment = fragment.split('?');
            if (fragment[1]) {
                var qs = fragment[1].split('&');
                for (i = 0; i < qs.length; i++) {
                    var bits = qs[i].split('=');
                    url_data[bits[0]] = bits[1];
                }
            }

            // Check route for match(es)
            for (var route in Colt.routes) {
                for (i = 0, max = Colt.routes[route].length; i < max; i++) {
                    // Get Name
                    module_name = Colt.routes[route][i][0];

                    // Check route for match
                    if (fragment[0] === route || route === '*') {

                        if (el_lock !== module_name) {

                            // Prevents other routes in the same module from hiding this
                            el_lock = module_name;
                            // Send module to processor
                            Colt.processor(module_name, Colt.routes[route][i][1], url_data);
                        }

                    } else {
                        // Hide sections that don't exist in current route
                        document.getElementById(module_name).innerHTML = '';
                    }
                }
            }

        },

        /**
         * Handles compilation of the module, loads template, fires dependency loader and event handler
         * @param  module         The module object to be used.
         * @param  route_fn       The return function from the route.
         */

        processor: function (module, route_fn, url_data) {

            var scope = Colt.scope[module];

            /**
             * Checks for & loads any dependencies before calling the route's function
             * @param  scope          The module object to be used.
             * @param  route_fn       The return function from the route.
             */

            function loadDependencies(scope, route_fn) {
                var arr_dep_name = [],
                    arr_dep_src = [];
                // Load module's dependencies
                if (scope.hasOwnProperty('dependencies')) {

                    // Build Dependency Arrays
                    for (var dep in scope.dependencies) {
                        arr_dep_name.push(dep);
                        arr_dep_src.push(scope.dependencies[dep]);
                    }

                    // Load deps and add to object
                    require(arr_dep_src, function () {
                        for (var i = 0, max = arguments.length; i < max; i++) {
                            scope[arr_dep_name[i]] = arguments[i];
                        }
                        // Fire function of route that called the processor
                        scope[route_fn](url_data);
                    });

                    // Module has no dependencies
                } else {
                    // Fire route's function
                    scope[route_fn](url_data);
                }
            }


            // Check to see if we are using inline template or if template has already been loaded/defined
            if (!scope.hasOwnProperty('template')) {

                Colt.AJAX('templates/' + scope.mid + '.tpl', function (data) {
                    if (data) {
                        scope.template = data;
                        loadDependencies(scope, route_fn);
                    } else {
                        console.error('Error Loading ' + scope.mid + '.tpl');
                    }
                });

            } else {
                loadDependencies(scope, route_fn);
            }
        },

        /**
         * Renders a module's template onto the screen
         * @param  scope    the module object to be used.
         * @param  data     any data to be rendered onto the template.
         */

        render: function (scope, data) {
            var template = scope.template,
                // Replace any mustache-style {{VAR}}'s
                rendered = template.replace(/\{\{([^}]+)\}\}/g, function (i, match) {
                    return data[match];
                });

            // Render to DOM
            document.getElementById(scope.mid).innerHTML = rendered;

            // Build Event Listeners
            this.delegateEvents(scope.events, scope);
        },

        /**
         * Responsible for updating the history hash, and changing the URL
         * @param  {string} fragment the location to be loaded
         * @return {bool} 
         */

        navigate: function (fragment) {

            var location = window.location,
                root = location.pathname.replace(/[^\/]$/, '$&');

            // Change the URL
            if(history.pushState()){
                history.pushState(null, document.title, location.search + '#!/' + fragment);
            }else{
                location.replace(root + location.search + '#!/' + fragment);
            }

        },

        /**
         * Set callback for a module's event list.
         * Using jQuery's on method, we can listen to the event_name on the 
         * selector and call a specified method, passing in scope as event.data.scope
         *
         * @param  {Object} events has of events to be watched for
         * @param  {Object} scope the current module
         */

        delegateEvents: function (events, scope) {

            var method,
            match,
            event_name,
            selector,
            nodes;

            // if there are no events on this sectional then we move on 
            if (!events) {
                return;
            }

            var delegateEventSplitter = /^(\S+)\s*(.*)$/;
            for (key in events) {
                if (events.hasOwnProperty(key)) {
                    method = events[key];
                    match = key.match(delegateEventSplitter);
                    event_name = match[1];
                    selector = match[2];
                    /*
                     * bind method on event for selector on scope.mid
                     * the caller function has access to event, Colt, scope
                     */
                    nodes = document.querySelectorAll('#' + scope.mid + ' ' + selector);

                    (function (nodes, method) {
                        for (var i = 0, max = nodes.length; i < max; i++) {
                            if (nodes[i].addEventListener) { // DOM Level 2 browsers
                                nodes[i].addEventListener(event_name, function (event) {
                                    (event.preventDefault) ? event.preventDefault() : event.returnValue = false;
                                    scope[method](event);
                                }, false);
                            } else { // IE <= 8
                                nodes[i].attachEvent('on' + event_name, function (event) {
                                    (event.preventDefault) ? event.preventDefault() : event.returnValue = false;
                                    scope[method](event);
                                });
                            }
                        }
                    })(nodes, method);
                }
            }
        },

        /**
         * Used to make AJAX calls
         * @param  url       The URL of the request
         * @param  callback  Callback function
         * @param  method    The method to be used
         * @param  async     Fire request asynchronously
         * @param  data      Data to be passed to request
         */

        AJAX: function (url, callback, method, async, data) {
            // Set variables
            var request = false;
            url = url || "";
            method = method || "GET";
            async = async || true;
            data = data || null;

            // Mozilla/Safari/Non-IE
            if (window.XMLHttpRequest) {
                request = new XMLHttpRequest();
            }
            // IE
            else if (window.ActiveXObject) {
                request = new ActiveXObject("Microsoft.XMLHTTP");
            }
            // If AJAX supported
            if (request !== false) {
                // Open Http Request connection
                if (method == "GET") {
                    url = url;
                    data = null;
                }
                request.open(method, url, async);
                // Set request header (optional if GET method is used)
                if (method === "POST") {
                    request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
                }
                // Assign (or define) response-handler/callback when ReadyState is changed.
                request.onreadystatechange = function () {
                    if (request.readyState === 4) {
                        if (typeof callback === 'function') {
                            callback(request.responseText);
                        }
                    }
                };
                // Send data
                request.send(data);

            } else {
                alert("Please use a browser with AJAX support!");
            }
        },

        /**
         * LocalStorage with polyfill support via cookies
         * @param  key       The key or identifier for the store
         * @param  value     Contents of the store
         */

        store: function (key, value) {

            var lsSupport = false;

            // Check for native support
            if (localStorage) {
                lsSupport = true;
            }

            // If value is detected, set new or modify store
            if (typeof value !== "undefined" && value !== null) {
                if (lsSupport) { // Native support
                    localStorage.setItem(key, value);
                } else { // Use Cookie
                    createCookie(key, value, 30);
                }
            }

            // No value supplied, return value
            if (typeof value === "undefined") {
                if (lsSupport) { // Native support
                    return localStorage.getItem(key);
                } else { // Use cookie 
                    return readCookie(key);
                }
            }

            // Null specified, remove store
            if (value === null) {
                if (lsSupport) { // Native support
                    localStorage.removeItem(key);
                } else { // Use cookie
                    createCookie(key, '', -1);
                }
            }

            // Polyfill functions using cookies

            /**
             * Creates new cookie or removes cookie with negative expiration
             * @param  key       The key or identifier for the store
             * @param  value     Contents of the store
             * @param  exp       Expiration - creation defaults to 30 days
             */

            function createCookie(key, value, exp) {
                var date = new Date();
                date.setTime(date.getTime() + (exp * 24 * 60 * 60 * 1000));
                var expires = "; expires=" + date.toGMTString();
                document.cookie = key + "=" + value + expires + "; path=/";
            }

            /**
             * Returns contents of cookie
             * @param  key       The key or identifier for the store
             */

            function readCookie(key) {
                var nameEQ = key + "=";
                var ca = document.cookie.split(';');
                for (var i = 0, max = ca.length; i < max; i++) {
                    var c = ca[i];
                    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
                    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
                }
                return null;
            }

        },

        // Placeholder object for pub/sub
        topics: {},

        // ID for incrementing    
        topic_id: 0,

        /**
         * Publish to a topic
         * @param  topic     Topic of the subscription
         * @param  args      Array of arguments passed
         */

        publish: function (topic, args) {
            if (!Colt.topics[topic]) {
                return false;
            }
            setTimeout(function () {
                var subscribers = Colt.topics[topic],
                    len = subscribers ? subscribers.length : 0;

                while (len--) {
                    subscribers[len].fn(args);
                }
            }, 0);
            return true;
        },

        /**
         * Subscribes to a topic
         * @param  topic     Topic of the subscription
         * @param  args      Function to be called
         */

        subscribe: function (topic, fn) {
            var id = ++Colt.topic_id;
            if (!Colt.topics[topic]) {
                Colt.topics[topic] = [];
            }
            Colt.topics[topic].push({
                id: id,
                fn: fn
            });
            return id;
        },

        /**
         * Unsubscribes from a topic
         * @param  token    Token of the subscription
         */

        unsubscribe: function (token) {
            for (var topic in Colt.topics) {
                for (var i = 0, max = Colt.topics[topic].length; i < max; i++) {
                    if (Colt.topics[topic][i].id === token) {
                        Colt.topics[topic].splice(i, 1);
                        return token;
                    }
                }
            }
            return false;
        }


    };


    // Return the framework
    return Colt;

});