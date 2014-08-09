(function($, window, document) {

	// Create the defaults once
	var pluginName = "resmon";
	var defaults = {
		monitorInterval : 1000,
		monitorLimit : Number.MAX_VALUE,
		additionalResources : [],
		onMonitorPoll : function() {
		},
		onBeforeResourceRequest : function(resource) {
		},
		onAfterResourceRequest : function(newResource) {
		},
		onResourceModified : function(resource) {
		}
	};

	// The actual plugin constructor
	function ResourceMonitor(options) {
		this.name = pluginName;
		this.resources = [];
		this.intervalTimerId = 0;
		this.monitorCount = 0;
		this.settings = $.extend({}, defaults, options);
		this.defaults = $.extend({}, defaults);
	}

	var Resource = function(type, url, contents, status) {
		if (type == null)
			throw "type is required";
		if (url == null)
			throw "url is required";
		this.type = type;
		this.url = url;
		this.contents = contents;
		this.status = status;
	};

	// private function for debugging
	var _log = function() {
		if (window.console && window.console.log)
			window.console.log(arguments);
	};

	// private function that iterates over all the resources and invokes the
	// _requestResource(url) function and adds the new resource to a new array
	// of resources.
	var _requestResources = function(plugin) {
		var resources = [];
		plugin.resources.forEach(function(resource) {
			if (plugin.status == plugin.statuses[2]) { // "started"
				plugin.settings.onBeforeResourceRequest.call(plugin, resource);
			}
			var newResource = _requestResource(resource);
			if (plugin.status == plugin.statuses[2]) { // "started"
				plugin.settings.onAfterResourceRequest.call(plugin, newResource);
			}
			resources.push(newResource);
		});
		return resources;
	};

	// private function that makes an AJAX request for a given url with the
	// ifModified property set to true. It will return an instance of a Resource
	// object.
	var _requestResource = function(resource) {
		var newResource;
		$.ajax({
			url : resource.url,
			dataType : "text",
			ifModified : true, // check the Last-Modified header
			async : false,
			success : function(contents, status) {
				newResource = new Resource(resource.type, resource.url, contents, status);
			},
			error : function(jqXHR, status, errorThrown) {
				// TODO: handle errors...
			}
		});
		return newResource;
	};

	// private function that initializes the _resources array and sets the
	// status of each resource to "notmodified" in order to compare when the
	// monitoring starts.
	var _initResources = function(plugin) {
		var resources = _requestResources(plugin);
		resources.forEach(function(resource) {
			// The first request will have 'success', so we will switch it to
			// 'notmodified' to begin the syncing.
			resource.status = "notmodified";
		});
		plugin.resources = resources;
	};

	// private function that invokes the _requestResources() function and
	// updates the master array of resources and makes sure the contents and
	// status are the latest.
	var _syncResources = function(plugin) {
		var newResources = _requestResources(plugin);
		newResources.forEach(function(newResource) {
			var resource = _findResourceByUrl(plugin, newResource.url);
			// only update the contents, if it changed...
			resource.contents = newResource.contents || resource.contents;
			resource.status = newResource.status;
		});
	};

	// private function that iterates over each resources in the _resources
	// array and triggers the "onResourceModified" event in order to notify
	// clients that the resource has been modified (status != "notmodified").
	var _notifyResourceModified = function(plugin) {
		plugin.resources.forEach(function(resource) {
			if (resource.status != "notmodified") {
				plugin.settings.onResourceModified.call(plugin, resource);
				resource.status = "notmodified";
			}
		});
	};

	// private function that invokes jQuery's grep function on the _resource
	// array to find a resource by url.
	var _findResourceByUrl = function(plugin, url) {
		return $.grep(plugin.resources, function(resource) {
			return resource.url == url;
		})[0]; // grep returns an array, so only return the first element.
	};

	// Avoid ResourceMonitor.prototype conflicts
	$.extend(ResourceMonitor.prototype, {
		version : "1.0",
		status : "created",
		statuses : [ "created", "initialized", "started", "stopped" ],
		resourceTypes : [ "script", "stylesheet", "html" ],

		init : function() {
			var plugin = this;
			if (plugin.status == plugin.statuses[2]) { // "started"
				plugin.stop();
			}
			var resource = new Resource("html", window.location.href);
			plugin.resources = [];
			plugin.resources.push(resource);
			// Get all the scripts...
			$("script[src]").each(function(index, script) {
				var resource = new Resource("script", script.src);
				plugin.resources.push(resource);
			});
			// Get all the style sheets...
			$("link[rel='stylesheet'][href]").each(function(index, link) {
				var resource = new Resource("stylesheet", link.href);
				plugin.resources.push(resource);
			});
			plugin.settings.additionalResources.forEach(function(resource) {
				plugin.resources.push(resource);
			});
			_initResources(plugin);
			plugin.status = plugin.statuses[0]; // "initialized"
		},

		start : function() {
			var plugin = this;
			if (plugin.status == plugin.statuses[2]) { // "started"
				return;
			}
			plugin.init();
			plugin.monitorCount = 0;
			plugin.intervalTimerId = setInterval(function() {
				if (plugin.monitorCount == plugin.settings.monitorLimit) {
					plugin.stop();
					return;
				}
				plugin.monitorCount++;
				plugin.settings.onMonitorPoll.call(plugin);
				_syncResources(plugin);
				_notifyResourceModified(plugin);

			}, plugin.settings.monitorInterval);
			plugin.status = plugin.statuses[2]; // "started"
		},

		stop : function() {
			var plugin = this;
			clearInterval(plugin.intervalTimerId);
			if (plugin.status == plugin.statuses[2]) { // "started"
				plugin.status = plugin.statuses[3]; // "stopped"
			}
		}
	});

	// A lightweight plugin wrapper around the constructor, preventing against
	// multiple instantiations
	$.ResourceMonitor = function(options) {
		var plugin = $("html").data(pluginName);
		if (!plugin || options) {
			plugin = new ResourceMonitor(options);
			$("html").data(pluginName, plugin);
		}
		// chain jQuery functions
		return plugin;
	};
	$.ResourceMonitor.Resource = Resource; // Expose the Resource class for
	// testing

})(jQuery, window, document);